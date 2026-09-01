import { buildReviewImpact } from './review-impact.mjs';
import { buildQualityReport } from './quality.mjs';
import { buildTrace } from './trace.mjs';
import { lint } from './lint.mjs';
import { cmdOutcomes } from './outcomes-cmd.mjs';
import { auditE2E } from './e2e-audit.mjs';

function changedSpecPath(path, changedSet, repo) {
  return changedSet.has(path) || changedSet.has(`${repo.specPathPrefix}${path}`);
}

/** One change report: impact, local risks, and required checks. */
export function buildChangeReport(repo, changedFiles, { semanticDiff = null } = {}) {
  const impact = buildReviewImpact(repo, changedFiles);
  const changedSet = new Set(impact.changedFiles);
  const changedSpec = impact.changedFiles.some((changed) => (repo.specPathPrefix && changed.startsWith(repo.specPathPrefix)) || repo.files.some((file) => file.path === changed));
  const requirementIds = new Set(impact.contexts.flatMap((context) => context.requirements.map((req) => req.id)));
  const specPaths = new Set(impact.contexts.flatMap((context) => context.terms.map((term) => term.path)));

  const quality = buildQualityReport(repo).rows.filter((row) => requirementIds.has(row.requirement) || changedSpecPath(row.path, changedSet, repo));
  const lintFindings = lint(repo).filter((finding) => specPaths.has(finding.path) || changedSpecPath(finding.path, changedSet, repo));
  const traceGaps = buildTrace(repo, { missingOnly: true }).filter((row) => requirementIds.has(row.id));
  const outcomes = [];
  for (const id of [...requirementIds].sort()) {
    const found = repo.requirementsById.get(id);
    if (!found?.req.outcomes) continue;
    const result = cmdOutcomes(repo, id);
    outcomes.push({ id, status: result.status, summary: result.text.split('\n')[0] });
  }
  const e2eRows = auditE2E(repo).rows.filter((row) => row.requirements.some((id) => requirementIds.has(id)));

  const checks = new Set(['spec9 lint']);
  for (const id of outcomes.map((entry) => entry.id)) checks.add(`spec9 outcomes ${id}`);
  for (const id of impact.contexts.flatMap((context) => context.decisions)) checks.add(`spec9 decision ${id}`);
  if (e2eRows.length) checks.add('spec9 e2e --missing');
  if (requirementIds.size) checks.add('spec9 trace --missing');
  if (changedSpec) checks.add('spec9 coverage --missing');

  const hasHardRisk = lintFindings.some((row) => row.level === 'ERROR') || traceGaps.some((row) => row.state === 'broken') || outcomes.some((row) => row.status === 'discrepancy') || semanticDiff?.risk === 'high';
  const hasReviewRisk = impact.unmappedFiles.length || lintFindings.length || quality.length || traceGaps.length || outcomes.some((row) => row.status === 'unchecked') || e2eRows.some((row) => row.coverage !== 'exact') || semanticDiff?.risk === 'medium';
  const risk = hasHardRisk ? 'high' : hasReviewRisk ? 'medium' : 'low';

  return {
    risk,
    impact,
    affectedRequirements: [...requirementIds].sort(),
    semanticDiff: semanticDiff || { status: 'not-computed', reason: 'a base/head graph comparison is required' },
    findings: { lint: lintFindings, trace: traceGaps, quality, outcomes, e2e: e2eRows },
    checks: [...checks],
  };
}

export function formatChangeReport(report) {
  const lines = [
    `CHANGE: risk ${report.risk.toUpperCase()} · ${report.impact.changedFiles.length} files · ${report.impact.contexts.length} contexts · ${report.affectedRequirements.length} requirements`,
  ];
  if (report.impact.unmappedFiles.length) {
    lines.push('', `Unmapped (${report.impact.unmappedFiles.length}):`, ...report.impact.unmappedFiles.map((file) => `- ${file}`));
  }
  for (const context of report.impact.contexts) {
    lines.push('', `## ${context.id} — ${context.title}`);
    lines.push(`Terms: ${context.terms.map((term) => term.id).join(', ') || '—'}`);
    if (context.decisions.length) lines.push(`Decisions: ${context.decisions.join(', ')}`);
    if (context.requirements.length) lines.push(`Requirements: ${context.requirements.map((req) => req.id).join(', ')}`);
  }

  const { findings } = report;
  const e2eAttention = findings.e2e.filter((row) => row.coverage !== 'exact');
  const problemCount = findings.lint.length + findings.trace.length + findings.quality.length + findings.outcomes.filter((row) => row.status !== 'ok').length + e2eAttention.length;
  if (problemCount) {
    lines.push('', `## Needs attention (${problemCount})`);
    for (const row of findings.lint) lines.push(`- [lint/${row.level}] ${row.code} ${row.path}:${row.line} — ${row.message}`);
    for (const row of findings.trace) lines.push(`- [trace] ${row.id} — ${row.gaps.join(', ')}`);
    for (const row of findings.quality) lines.push(`- [quality/${row.severity}] ${row.code} ${row.requirement || `${row.path}:${row.line}`} — ${row.message}`);
    for (const row of findings.outcomes.filter((entry) => entry.status !== 'ok')) lines.push(`- [outcomes/${row.status}] ${row.id} — ${row.summary}`);
    const e2eCounts = { coarse: 0, missing: 0, invalid: 0 };
    for (const row of e2eAttention) e2eCounts[row.coverage]++;
    if (e2eAttention.length) lines.push(`- [e2e] ${Object.entries(e2eCounts).filter(([, count]) => count).map(([status, count]) => `${status}=${count}`).join(', ')}`);
  }

  lines.push('', '## Verify', ...report.checks.map((check) => `- ${check}`));
  lines.push('', '## Domain impact', `- Contexts: ${report.impact.contexts.map((context) => context.id).join(', ') || 'not identified'}`);
  lines.push(`- Terms: ${report.impact.contexts.flatMap((context) => context.terms.map((term) => term.id)).join(', ') || 'not identified'}`);
  lines.push(`- Requirements: ${report.affectedRequirements.join(', ') || 'not identified'}`);
  lines.push(`- Decisions: ${report.impact.contexts.flatMap((context) => context.decisions).join(', ') || 'not affected'}`);
  if (report.semanticDiff.status === 'not-computed') {
    lines.push('- Relations and boundaries: current impact is known; additions and removals require semantic base/head review');
  } else {
    const relations = report.semanticDiff.counts.relations;
    lines.push(`- Relations: +${relations.added} / -${relations.removed}`);
    for (const edge of report.semanticDiff.relations.added) lines.push(`  - added: ${edge.from} -[${edge.type}]-> ${edge.to}`);
    for (const edge of report.semanticDiff.relations.removed) lines.push(`  - removed: ${edge.from} -[${edge.type}]-> ${edge.to}`);
    lines.push(`- Boundaries: ${report.semanticDiff.counts.boundaries} changes`);
    for (const item of report.semanticDiff.boundaries.terms) lines.push(`  - ${item.change}: ${item.term.id} (${item.term.kind})`);
    for (const item of report.semanticDiff.boundaries.relations) lines.push(`  - ${item.change}: ${item.edge.from} -[${item.edge.type}]-> ${item.edge.to}`);
  }
  return lines.join('\n');
}
