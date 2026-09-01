import { buildDoctorReport } from './doctor.mjs';
import { buildQualityReport } from './quality.mjs';

function priority(score) {
  if (score >= 95) return 'P0';
  if (score >= 80) return 'P1';
  if (score >= 60) return 'P2';
  return 'P3';
}

function item(score, code, title, detail, action, location = null, count = 1) {
  return { score, priority: priority(score), code, title, detail, action, location, count };
}

function groupedQuality(report, code, score, title, action) {
  const rows = report.rows.filter((row) => row.code === code);
  if (!rows.length) return null;
  const sample = rows.slice(0, 3).map((row) => row.requirement || `${row.path}:${row.line}`).join(', ');
  return item(score, code, title, `${rows.length} signals; first: ${sample}`, action, null, rows.length);
}

/** Prioritized work queue computed from the current specification state. */
export function buildNextQueue(repo) {
  const doctor = buildDoctorReport(repo);
  const quality = buildQualityReport(repo);
  const items = [];

  const combinationFindings = doctor.lint.findings.filter((finding) => finding.code.startsWith('W-COMBINATIONS-UNDEFINED'));
  if (combinationFindings.length) {
    const representative = combinationFindings.find((finding) => finding.code.endsWith('COVERAGE')) || combinationFindings[0];
    items.push(item(92, 'COMBINATIONS-UNDEFINED', representative.message,
      combinationFindings.map((finding) => finding.code).join(', '),
      'make the domain decision, fill the outcome, and rerun spec9 lint',
      `${representative.path}:${representative.line}`));
  }
  for (const finding of doctor.lint.findings.filter((entry) => !entry.code.startsWith('W-COMBINATIONS-UNDEFINED'))) {
    const score = finding.level === 'ERROR' ? 100 : 76;
    items.push(item(score, finding.code, finding.message, `${finding.path}:${finding.line}`, 'fix the lint finding and rerun spec9 lint', `${finding.path}:${finding.line}`));
  }

  for (const row of doctor.trace.rows.filter((entry) => entry.state !== 'planned')) {
    const score = row.state === 'broken' ? 96 : row.state === 'implementation' ? 84 : 42;
    const code = row.state === 'planned' ? 'TRACE-PLANNED' : row.state === 'broken' ? 'TRACE-BROKEN' : 'TRACE-IMPLEMENTATION';
    items.push(item(score, code, `${row.id}: ${row.state} trace`, row.gaps.join(', '), `spec9 context ${row.id} --slice implement`, row.owner.path));
  }
  const plannedTrace = doctor.trace.rows.filter((entry) => entry.state === 'planned');
  if (plannedTrace.length) {
    items.push(item(42, 'TRACE-PLANNED', 'Plan implementation for accepted domain deltas',
      `${plannedTrace.length} planned requirements; first: ${plannedTrace.slice(0, 3).map((row) => row.id).join(', ')}`,
      'spec9 trace --missing', null, plannedTrace.length));
  }

  for (const check of doctor.outcomes.checks.filter((entry) => entry.status !== 'ok')) {
    const discrepancy = check.status === 'discrepancy';
    items.push(item(discrepancy ? 98 : 82, `OUTCOME-${check.status.toUpperCase()}`, `${check.id}: ${discrepancy ? 'outcome discrepancy' : 'outcomes were not checked'}`, check.text.split('\n')[0], `spec9 outcomes ${check.id}`, null));
  }

  for (const row of quality.rows.filter((entry) => entry.code === 'W-UNRESOLVED-CLAIM')) {
    items.push(item(88, row.code, 'Resolve the implementation or debt claim', row.message, row.action, `${row.path}:${row.line}`));
  }
  const qualityGroups = [
    groupedQuality(quality, 'W-SELF-ONLY-SUBJECT', 68, 'Name the actual norm subjects', 'spec9 quality --all'),
    groupedQuality(quality, 'W-GENERIC-NORM', 64, 'Rewrite migration prose as standalone predicates', 'spec9 quality --all'),
    groupedQuality(quality, 'W-COARSE-EVIDENCE', 58, 'Narrow test evidence to a case ID or symbol', 'spec9 e2e --missing'),
    groupedQuality(quality, 'W-BROAD-CODE-ANCHOR', 38, 'Narrow code anchors to symbols', 'spec9 quality --all'),
    groupedQuality(quality, 'W-DECISION-AS-SPEC', 74, 'Move requirement deltas out of ADR pages', 'spec9 quality --all'),
  ];
  items.push(...qualityGroups.filter(Boolean));

  if (doctor.openspec.counts.missing || doctor.openspec.counts.duplicate || doctor.openspec.counts.unknown) {
    const count = doctor.openspec.counts.missing + doctor.openspec.counts.duplicate + doctor.openspec.counts.unknown;
    items.push(item(94, 'OPENSPEC-COVERAGE', 'Restore unambiguous OpenSpec coverage', `${count} migration issues`, 'spec9 coverage --missing', null, count));
  }
  if (doctor.openspec.levels.modeled < doctor.openspec.levels.total) {
    const count = doctor.openspec.levels.total - doctor.openspec.levels.modeled;
    items.push(item(62, 'MIGRATION-MODELING', 'Turn preserved migration text into domain predicates',
      `${doctor.openspec.levels.modeled}/${doctor.openspec.levels.total} migrated requirements are modeled`,
      'spec9 coverage --missing', null, count));
  } else if (doctor.openspec.levels.verified < doctor.openspec.levels.total) {
    const count = doctor.openspec.levels.total - doctor.openspec.levels.verified;
    items.push(item(46, 'MIGRATION-VERIFICATION', 'Attach exact evidence to modeled migration requirements',
      `${doctor.openspec.levels.verified}/${doctor.openspec.levels.total} migrated requirements are verified`,
      'spec9 coverage --missing', null, count));
  }
  if (doctor.e2e.counts.invalid) {
    items.push(item(97, 'E2E-INVALID', 'Fix invalid E2E cases', `${doctor.e2e.counts.invalid} invalid`, 'spec9 e2e --missing', null, doctor.e2e.counts.invalid));
  }
  if (doctor.e2e.counts.missing) {
    items.push(item(72, 'E2E-MISSING', 'Link E2E cases to Spec9 requirements', `${doctor.e2e.counts.missing} cases without evidence`, 'spec9 e2e --missing', null, doctor.e2e.counts.missing));
  }
  if (doctor.e2e.counts.coarse) {
    items.push(item(52, 'E2E-COARSE', 'Make E2E links exact', `${doctor.e2e.counts.coarse} cases have file-level evidence only`, 'spec9 e2e --missing', null, doctor.e2e.counts.coarse));
  }
  if (doctor.candidates.pending) {
    items.push(item(32, 'CANDIDATES', 'Triage domain vocabulary candidates', `${doctor.candidates.pending} candidates without a verdict`, 'spec9 candidates --new', null, doctor.candidates.pending));
  }

  items.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code) || String(a.location).localeCompare(String(b.location)));
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const entry of items) counts[entry.priority]++;
  return { status: items.length ? 'work' : 'clear', total: items.length, counts, items };
}

export function formatNextQueue(report, { all = false, limit = 10 } = {}) {
  const visible = all ? report.items : report.items.slice(0, limit);
  const lines = [
    `NEXT: ${report.total} items (${Object.entries(report.counts).map(([key, value]) => `${key} ${value}`).join(' / ')})`,
  ];
  if (!visible.length) return `${lines[0]}\nQueue is empty.`;
  for (const entry of visible) {
    lines.push(`- [${entry.priority}] ${entry.code} — ${entry.title}${entry.count > 1 ? ` (${entry.count})` : ''}`);
    lines.push(`  ${entry.detail}`);
    if (entry.location) lines.push(`  at: ${entry.location}`);
    lines.push(`  → ${entry.action}`);
  }
  if (!all && report.items.length > visible.length) lines.push('', `${report.items.length - visible.length} more: spec9 next --all`);
  return lines.join('\n');
}
