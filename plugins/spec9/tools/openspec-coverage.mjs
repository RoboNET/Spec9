import fs from 'node:fs';
import path from 'node:path';
import { resolveAnchor, resolveLink } from './graph.mjs';

function configuredRoots(repo) {
  const configured = repo.profile?.legacy?.openspec_roots;
  if (!Array.isArray(configured) || configured.length === 0) {
    return [{ path: 'openspec', prefix: '', include_changes: false }];
  }
  return configured
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.path === 'string')
    .map((entry) => ({
      path: entry.path,
      prefix: typeof entry.prefix === 'string' ? entry.prefix.replace(/^\/+|\/+$/g, '') : '',
      include_changes: entry.include_changes === true,
    }));
}

function requirementRows(productRoot, specRoot, prefix, sourcePrefix = '') {
  if (!fs.existsSync(specRoot)) return [];
  const rows = [];
  for (const entry of fs.readdirSync(specRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = path.join(specRoot, entry.name, 'spec.md');
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const match = /^### Requirement:\s*(.+?)\s*$/.exec(lines[index]);
      if (!match) continue;
      const title = match[1];
      const capability = [prefix, sourcePrefix, entry.name].filter(Boolean).join('/');
      rows.push({
        key: `${capability}::${title}`,
        capability,
        title,
        file: path.relative(productRoot, file).split(path.sep).join('/'),
        line: index + 1,
      });
    }
  }
  return rows;
}

function openSpecRequirements(repo) {
  const rows = [];
  for (const source of configuredRoots(repo)) {
    const sourceRoot = path.resolve(repo.productRoot, source.path);
    const relative = path.relative(repo.productRoot, sourceRoot);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    rows.push(...requirementRows(repo.productRoot, path.join(sourceRoot, 'specs'), source.prefix));
    if (!source.include_changes) continue;
    const changesRoot = path.join(sourceRoot, 'changes');
    if (!fs.existsSync(changesRoot)) continue;
    for (const change of fs.readdirSync(changesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!change.isDirectory() || change.name === 'archive') continue;
      rows.push(...requirementRows(
        repo.productRoot,
        path.join(changesRoot, change.name, 'specs'),
        source.prefix,
        `changes/${change.name}`,
      ));
    }
  }
  return rows;
}

/** Сравнивает каждое OpenSpec requirement с co-located origins норм spec9. */
export function buildOpenSpecCoverage(repo) {
  const legacy = openSpecRequirements(repo);
  const legacySourcesPresent = legacy.length > 0;
  const legacyByKey = new Map(legacy.map((row) => [row.key, row]));
  const claims = new Map();
  for (const [id, { file, req }] of repo.requirementsById) {
    for (const origin of req.origins || []) {
      if (!claims.has(origin)) claims.set(origin, []);
      claims.get(origin).push({ id, file: file.path });
    }
  }

  const maturityRows = [];
  for (const [id, { file, req }] of repo.requirementsById) {
    if (!(req.origins || []).length) continue;
    const context = String(file.frontmatter?.context || '');
    const subjects = (req.subjects || []).map((ref) => resolveLink({ ref }, context, repo).target).filter(Boolean);
    const hasRealSubject = subjects.some((entity) => entity.kind !== repo.decisionKind);
    const sentences = (file.norms || []).filter((norm) => norm.startLine >= req.sectionStart && norm.startLine < req.sectionEnd);
    const generic = sentences.some((norm) => /\bMUST\s+соблюдать\s+правило[\s\S]*условиями/i.test(norm.sentenceText));
    const exactEvidence = (req.evidenceAnchors || []).filter((anchor) => anchor.symbol && resolveAnchor(anchor, repo.productRoot).ok);
    const preserved = true;
    const modeled = preserved && hasRealSubject && !generic;
    const verified = modeled && exactEvidence.length > 0;
    maturityRows.push({
      id,
      origins: [...req.origins],
      preserved,
      modeled,
      verified,
      reasons: [
        ...(!hasRealSubject ? ['no-real-domain-subject'] : []),
        ...(generic ? ['generic-migration-predicate'] : []),
        ...(exactEvidence.length === 0 ? ['no-exact-evidence'] : []),
      ],
    });
  }
  const rows = legacy.map((source) => {
    const targets = claims.get(source.key) || [];
    return { ...source, coverage: targets.length === 0 ? 'missing' : targets.length === 1 ? 'covered' : 'duplicate', targets };
  });
  const unknown = [];
  if (legacySourcesPresent) {
    for (const [origin, targets] of claims) if (!legacyByKey.has(origin)) unknown.push({ origin, targets });
  }
  const counts = { covered: 0, missing: 0, duplicate: 0, unknown: unknown.length };
  for (const row of rows) counts[row.coverage]++;
  const capabilities = [...new Set(legacy.map((row) => row.capability))].sort().map((capability) => {
    const subset = rows.filter((row) => row.capability === capability);
    return {
      capability,
      total: subset.length,
      covered: subset.filter((row) => row.coverage === 'covered').length,
      missing: subset.filter((row) => row.coverage === 'missing').length,
      duplicate: subset.filter((row) => row.coverage === 'duplicate').length,
    };
  });
  const levels = {
    total: maturityRows.length,
    preserved: maturityRows.filter((row) => row.preserved).length,
    modeled: maturityRows.filter((row) => row.modeled).length,
    verified: maturityRows.filter((row) => row.verified).length,
    rows: maturityRows,
  };
  return { total: rows.length, counts, capabilities, rows, unknown, levels, legacySourcesPresent, provenanceOrigins: claims.size };
}

export function formatOpenSpecCoverage(report, { missingOnly = false } = {}) {
  const lines = [
    report.legacySourcesPresent
      ? `OpenSpec → Spec9: ${report.counts.covered}/${report.total} covered; ${report.counts.missing} missing; ${report.counts.duplicate} duplicate; ${report.counts.unknown} unknown origins`
      : `Legacy OpenSpec sources are absent; ${report.provenanceOrigins} provenance origins remain in Spec9.`,
    `Migration maturity: ${report.levels.preserved}/${report.levels.total} preserved; ${report.levels.modeled} modeled; ${report.levels.verified} verified`,
  ];
  for (const item of report.capabilities) {
    if (missingOnly && item.missing === 0 && item.duplicate === 0) continue;
    lines.push(`- ${item.capability}: ${item.covered}/${item.total}${item.missing ? `; missing ${item.missing}` : ''}${item.duplicate ? `; duplicate ${item.duplicate}` : ''}`);
  }
  if (missingOnly) {
    for (const row of report.rows.filter((item) => item.coverage !== 'covered')) {
      lines.push(`  - [${row.coverage}] ${row.key}${row.targets.length ? ` → ${row.targets.map((target) => target.id).join(', ')}` : ''}`);
    }
    for (const row of report.unknown) lines.push(`  - [unknown] ${row.origin} → ${row.targets.map((target) => target.id).join(', ')}`);
    const maturityGaps = report.levels.rows.filter((item) => !item.verified);
    for (const row of maturityGaps.slice(0, 50)) {
      lines.push(`  - [${row.modeled ? 'modeled' : 'preserved'}] ${row.id}: ${row.reasons.join(', ')}`);
    }
    if (maturityGaps.length > 50) lines.push(`  - … ${maturityGaps.length - 50} more; use --json for the complete machine-readable report`);
  }
  return lines.join('\n');
}
