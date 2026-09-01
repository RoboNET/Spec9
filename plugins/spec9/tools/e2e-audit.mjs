import fs from 'node:fs';
import path from 'node:path';
import { parseYAML } from './yaml.mjs';
import { resolveExistingWithinRoot } from './safe-path.mjs';

function yamlFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...yamlFiles(full));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/**
 * Проверяет не старый openspec requirement, а реальную связность E2E-кейса со
 * spec9 evidence. Файловый test-якорь считается coarse, `#CASE-ID` — exact.
 */
export function auditE2E(repo) {
  const configured = repo.profile?.e2e?.roots;
  const caseRoots = Array.isArray(configured) && configured.length > 0 ? configured : ['tests/e2e/cases'];
  const normalizedRoots = caseRoots
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => path.posix.normalize(entry.replace(/\\/g, '/')).replace(/\/$/u, ''));
  const evidence = [];
  for (const [reqId, { req }] of repo.requirementsById) {
    for (const anchor of req.evidenceAnchors) {
      if (anchor.type === 'test' && normalizedRoots.some((root) => anchor.file === root || anchor.file.startsWith(`${root}/`))) {
        evidence.push({ reqId, file: anchor.file, symbol: anchor.symbol || null });
      }
    }
  }

  const rows = [];
  for (const root of caseRoots) {
    if (typeof root !== 'string' || !root.trim()) {
      rows.push({ file: String(root), id: null, title: null, declaredRequirement: null, coverage: 'invalid', requirements: [], error: 'E2E root must be a non-empty string' });
      continue;
    }
    let casesRoot;
    try {
      casesRoot = resolveExistingWithinRoot(repo.productRoot, root, { kind: 'directory', label: 'E2E root', allowRoot: true }).absolute;
    } catch (error) {
      rows.push({ file: root, id: null, title: null, declaredRequirement: null, coverage: 'invalid', requirements: [], error: error.message });
      continue;
    }
    const files = yamlFiles(casesRoot);
    if (files.length === 0) {
      rows.push({ file: root, id: null, title: null, declaredRequirement: null, coverage: 'invalid', requirements: [], error: 'E2E root contains no YAML registries' });
      continue;
    }
    const rowsBeforeRoot = rows.length;
    let parsedRegistry = false;
    for (const abs of files) {
      const file = path.relative(repo.productRoot, abs).split(path.sep).join('/');
      let parsed;
      try {
        parsed = parseYAML(fs.readFileSync(abs, 'utf8'), 1);
      } catch (error) {
        rows.push({ file, id: null, title: null, declaredRequirement: null, coverage: 'invalid', requirements: [], error: error.message });
        continue;
      }
      parsedRegistry = true;
      for (const item of Array.isArray(parsed?.cases) ? parsed.cases : []) {
        if (!item || typeof item !== 'object') continue;
        const id = item.id ? String(item.id) : null;
        const exact = evidence.filter((a) => a.file === file && a.symbol === id);
        const coarse = evidence.filter((a) => a.file === file && !a.symbol);
        const matches = exact.length > 0 ? exact : coarse;
        const declaredRequirement = item.requirement ? String(item.requirement) : null;
        const declaredMatch = declaredRequirement?.match(/^spec9:((?:[a-z][a-z0-9_-]*\.)?[A-Z][A-Z0-9]*-[0-9]+)$/);
        const declaredId = declaredMatch?.[1] || null;
        const resolvedDeclaredId = declaredId
          ? (repo.requirementsById.resolveKey?.(declaredId) || (repo.requirementsById.has(declaredId) ? declaredId : null))
          : null;
        let coverage = exact.length > 0 ? 'exact' : coarse.length > 0 ? 'coarse' : 'missing';
        let error = null;
        if (declaredRequirement?.startsWith('spec9:')) {
          if (!declaredMatch) {
            coverage = 'invalid';
            error = `malformed Spec9 requirement reference: ${declaredRequirement}`;
          } else if (!resolvedDeclaredId) {
            coverage = 'invalid';
            error = `unknown or ambiguous Spec9 requirement: ${declaredId}`;
          } else if (matches.length > 0 && !matches.some((match) => match.reqId === resolvedDeclaredId)) {
            coverage = 'invalid';
            error = `declared ${resolvedDeclaredId} but evidence points to ${[...new Set(matches.map((match) => match.reqId))].sort().join(', ')}`;
          }
        }
        rows.push({
          file,
          id,
          title: item.title ? String(item.title) : null,
          declaredRequirement,
          resolvedRequirement: resolvedDeclaredId,
          legacyReference: Boolean(resolvedDeclaredId && declaredId && !declaredId.includes('.')),
          coverage,
          requirements: [...new Set(matches.map((a) => a.reqId))].sort(),
          error,
        });
      }
    }
    if (parsedRegistry && rows.length === rowsBeforeRoot) {
      rows.push({ file: root, id: null, title: null, declaredRequirement: null, coverage: 'invalid', requirements: [], error: 'E2E root contains no cases' });
    }
  }
  const counts = { exact: 0, coarse: 0, missing: 0, invalid: 0 };
  for (const row of rows) counts[row.coverage]++;
  return { rows, counts, total: rows.length };
}

export function formatE2EAudit(report, { missingOnly = false } = {}) {
  const visible = missingOnly ? report.rows.filter((row) => row.coverage !== 'exact') : report.rows;
  const lines = [
    `E2E ↔ Spec9: ${report.total} total; ${report.counts.exact} exact; ${report.counts.coarse} coarse; ${report.counts.missing} missing; ${report.counts.invalid} invalid`,
  ];
  if (missingOnly) {
    const groups = new Map();
    for (const row of visible) {
      if (!groups.has(row.file)) groups.set(row.file, { statuses: new Set(), ids: [], requirements: new Set(), errors: new Set() });
      const group = groups.get(row.file);
      group.statuses.add(row.coverage);
      if (row.id) group.ids.push(row.id);
      for (const req of row.requirements) group.requirements.add(req);
      if (row.error) group.errors.add(row.error);
    }
    for (const [file, group] of groups) {
      const suffix = group.requirements.size ? ` → ${[...group.requirements].sort().join(', ')}` : '';
      lines.push(`- [${[...group.statuses].sort().join('+')}] ${file}: ${group.ids.join(', ') || '?'}${suffix}`);
      for (const error of group.errors) lines.push(`  - ${error}`);
    }
    return lines.join('\n');
  }
  for (const row of visible) {
    lines.push(`- [${row.coverage}] ${row.id || '?'} — ${row.file}${row.requirements.length ? ` → ${row.requirements.join(', ')}` : ''}${row.error ? ` (${row.error})` : ''}`);
  }
  return lines.join('\n');
}

export function formatE2ESuggestions(report) {
  const rows = report.rows.filter((row) => row.coverage === 'coarse' || row.coverage === 'missing');
  if (!rows.length) return 'No E2E evidence suggestions: every valid case has an exact anchor.';
  const lines = ['Suggested exact evidence anchors (review before applying):'];
  for (const row of rows) {
    if (!row.id || !row.resolvedRequirement) {
      lines.push(`- ${row.file}#${row.id || '?'}: declare a qualified spec9:<context>.<ID> requirement first`);
      continue;
    }
    lines.push(`- ${row.resolvedRequirement}: test:${row.file}#${row.id}`);
  }
  return lines.join('\n');
}
