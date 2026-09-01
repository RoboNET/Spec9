const QUALITY_CODES = new Set([
  'W-GENERIC-NORM',
  'W-SELF-ONLY-SUBJECT',
  'W-COARSE-EVIDENCE',
  'W-BROAD-CODE-ANCHOR',
  'W-UNRESOLVED-CLAIM',
  'W-DECISION-AS-SPEC',
]);

export function isQualityCode(code) {
  return QUALITY_CODES.has(code);
}

function row(code, severity, file, line, requirement, message, action) {
  return { code, severity, path: file.path, line, requirement, message, action };
}

/** Semantic weakness signals that are intentionally separate from syntax lint. */
export function buildQualityReport(repo) {
  const rows = [];
  for (const file of repo.files) {
    const fm = file.frontmatter;
    if (!fm?.id || !fm?.context) continue;
    const owner = `${fm.context}.${fm.id}`;

    if (String(fm.kind) === repo.decisionKind && file.requirements.length > 0) {
      const soleDecisionSubjects = file.requirements.filter((req) => req.subjects.length === 1 && req.subjects[0] === owner).length;
      rows.push(row('W-DECISION-AS-SPEC', soleDecisionSubjects ? 'high' : 'medium', file, file.frontmatterStartLine, null,
        `decision ${owner} contains ${file.requirements.length} requirement(s); ${soleDecisionSubjects} are attached only to the ADR itself`,
        'move requirement deltas to the affected domain terms and keep the ADR as rationale via decided_by'));
    }

    for (const req of file.requirements) {
      if (!req.id) continue;
      const reqId = req.qualifiedId || `${fm.context}.${req.id}`;
      if (['операция', 'процесс'].includes(String(fm.kind)) && req.subjects.length === 1 && req.subjects[0] === owner) {
        rows.push(row('W-SELF-ONLY-SUBJECT', 'medium', file, req.headingLine, reqId,
          `requirement ${reqId} is attached only to owner ${owner}; no domain entity, contract, or configuration is named`,
          `spec9 context ${reqId} --slice implement`));
      }

      const sentences = file.norms.filter((norm) => norm.startLine >= req.sectionStart && norm.startLine < req.sectionEnd);
      // В JavaScript `\b` знает только ASCII-слово, поэтому вокруг русских
      // слов граница не срабатывает. Оставляем её только перед RFC-оператором.
      if (sentences.some((norm) => /\bMUST\s+соблюдать\s+правило[\s\S]*условиями/i.test(norm.sentenceText))) {
        rows.push(row('W-GENERIC-NORM', 'medium', file, req.headingLine, reqId,
          `requirement ${reqId} uses a migration wrapper instead of a standalone predicate`,
          `open ${file.path}#${req.id}`));
      }

      const tests = req.evidenceAnchors.filter((anchor) => anchor.type === 'test');
      if (tests.length > 0 && tests.every((anchor) => !anchor.symbol)) {
        rows.push(row('W-COARSE-EVIDENCE', 'medium', file, req.headingLine, reqId,
          `test evidence for ${reqId} points only to a file, without a #CASE-ID or symbol`,
          `run spec9 e2e --suggest and add an exact test anchor for ${reqId}`));
      }

      const broadCode = req.evidenceAnchors.filter((anchor) => anchor.type === 'code' && !anchor.symbol);
      if (broadCode.length > 0) {
        rows.push(row('W-BROAD-CODE-ANCHOR', 'low', file, req.headingLine, reqId,
          `code evidence for ${reqId} does not name a symbol: ${broadCode.map((anchor) => anchor.target).join(', ')}`,
          `add code:...#symbol in ${file.path}`));
      }
    }

    const broadPageCode = file.frontmatterAnchors.filter((anchor) => anchor.type === 'code' && !anchor.symbol);
    if (broadPageCode.length > 0) {
      rows.push(row('W-BROAD-CODE-ANCHOR', 'low', file, file.frontmatterStartLine, null,
        `page-level code evidence does not name a symbol: ${broadPageCode.map((anchor) => anchor.target).join(', ')}`,
        `add a symbol to anchors.code in ${file.path}`));
    }

    const claimPattern = /\bKNOWN GAP\b|\bTBD\b|не\s+реализован[аоы]?|проверя(?:ется|ются)\s+вручную|#\[ignore\]/iu;
    const claimedRequirements = new Set();
    for (let index = 0; index < file.maskedLines.length; index++) {
      const text = file.maskedLines[index];
      if (!claimPattern.test(text)) continue;
      const line = file.bodyStartLine + index;
      const requirement = file.requirements.find((req) => line >= req.sectionStart && line < req.sectionEnd) || null;
      // A gap is unresolved only while it has no explicit decision owner.
      // `decided_by` is validated separately by lint (qualified ID, existing
      // ADR, legal kind), so a claim linked to an ADR remains reviewable via
      // `decision` without appearing as anonymous prose debt here.
      if (requirement?.decidedBy?.length) continue;
      // Заголовок, нормативное предложение и миграционная заметка часто
      // повторяют один KNOWN GAP. Это одна задача на норму, а не три.
      const requirementId = requirement ? (requirement.qualifiedId || `${fm.context}.${requirement.id}`) : null;
      if (requirement && claimedRequirements.has(requirementId)) continue;
      if (requirement) claimedRequirements.add(requirementId);
      rows.push(row('W-UNRESOLVED-CLAIM', 'high', file, line, requirementId,
        `the claim needs an explicit decision, ADR, or removal as stale text: ${text.trim().slice(0, 180)}`,
        `review the claim at ${file.path}:${line}`));
    }
  }

  const counts = {};
  const severityCounts = { high: 0, medium: 0, low: 0 };
  for (const code of QUALITY_CODES) counts[code] = 0;
  for (const item of rows) {
    counts[item.code]++;
    severityCounts[item.severity]++;
  }
  return { total: rows.length, counts, severityCounts, rows };
}

export function formatQualityReport(report, { all = false } = {}) {
  const lines = [
    `Quality: ${report.total} signals (${report.severityCounts.high} high / ${report.severityCounts.medium} medium / ${report.severityCounts.low} low)`,
  ];
  for (const [code, count] of Object.entries(report.counts)) lines.push(`- ${code}: ${count}`);
  if (!all) {
    if (report.total) lines.push('', 'Details: spec9 quality --all');
    return lines.join('\n');
  }
  for (const item of [...report.rows].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)) {
    lines.push(`- [${item.severity}] ${item.code} ${item.path}:${item.line}${item.requirement ? ` (${item.requirement})` : ''}`, `  ${item.message}`, `  → ${item.action}`);
  }
  return lines.join('\n');
}
