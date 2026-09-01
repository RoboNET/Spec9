import { resolveLink } from './graph.mjs';
import { buildTrace } from './trace.mjs';

function keyOf(entity) {
  return `${entity.context}.${entity.id}`;
}

function relationTargets(entity, relation, repo) {
  return entity.file.links
    .filter((link) => link.relation === relation)
    .map((link) => resolveLink(link, entity.context, repo).target)
    .filter(Boolean);
}

export function decisionIndex(repo) {
  const records = new Map();
  for (const entity of repo.entities.filter((candidate) => candidate.kind === repo.decisionKind)) {
    records.set(keyOf(entity), {
      id: keyOf(entity),
      entity,
      declaredStatus: entity.file.frontmatter.status,
      proposedStatus: repo.proposedDecisionStatus,
      acceptedStatus: repo.acceptedDecisionStatus,
      replaces: relationTargets(entity, 'replaces', repo).map(keyOf),
      revokes: relationTargets(entity, 'revokes', repo).map(keyOf),
      incoming: [],
    });
  }
  for (const record of records.values()) {
    for (const target of record.replaces) records.get(target)?.incoming.push({ source: record.id, relation: 'replaces' });
    for (const target of record.revokes) records.get(target)?.incoming.push({ source: record.id, relation: 'revokes' });
  }
  return records;
}

export function effectiveDecisionStatus(record, index) {
  if (!record.acceptedStatus || record.declaredStatus !== record.acceptedStatus) return record.declaredStatus;
  const acceptedIncoming = record.incoming.filter((edge) => {
    const source = index.get(edge.source);
    return source?.acceptedStatus && source.declaredStatus === source.acceptedStatus;
  });
  if (acceptedIncoming.some((edge) => edge.relation === 'revokes')) return 'revoked';
  if (acceptedIncoming.some((edge) => edge.relation === 'replaces')) return 'replaced';
  return record.acceptedStatus;
}

export function decisionCycles(index) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  function visit(id) {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    state.set(id, 1);
    stack.push(id);
    const record = index.get(id);
    for (const target of [...(record?.replaces || []), ...(record?.revokes || [])]) visit(target);
    stack.pop();
    state.set(id, 2);
  }
  for (const id of index.keys()) visit(id);
  return cycles;
}

export function resolveDecision(repo, id) {
  if (id.includes('.')) {
    const dot = id.indexOf('.');
    const entity = repo.entitiesByContextId.get(`${id.slice(0, dot)} ${id.slice(dot + 1)}`);
    if (!entity || entity.kind !== repo.decisionKind) throw new Error(`decision "${id}" not found`);
    return entity;
  }
  const candidates = (repo.entitiesById.get(id) || []).filter((entity) => entity.kind === repo.decisionKind);
  if (candidates.length === 0) throw new Error(`decision "${id}" not found`);
  if (candidates.length > 1) throw new Error(`decision "${id}" is ambiguous; use context.id`);
  return candidates[0];
}

function requirementsDecidedBy(repo, decisionId) {
  const rows = [];
  for (const file of repo.files) {
    const context = String(file.frontmatter?.context || '');
    for (const req of file.requirements) {
      const matches = (req.decidedBy || []).some((ref) => {
        const target = resolveLink({ ref }, context, repo).target;
        return target && keyOf(target) === decisionId;
      });
      if (matches) rows.push({ id: req.qualifiedId || `${context}.${req.id}`, title: req.title, owner: `${context}.${file.frontmatter.id}`, path: file.path });
    }
  }
  return rows;
}

function reverseDependents(repo, seeds) {
  const dependents = new Map();
  for (const file of repo.files) {
    const fm = file.frontmatter;
    if (!fm?.id || !fm?.context) continue;
    const source = repo.entitiesByContextId.get(`${fm.context} ${fm.id}`);
    if (!source) continue;
    let matched = false;
    for (const link of file.links) {
      const target = resolveLink(link, String(fm.context), repo).target;
      if (target && seeds.has(keyOf(target))) matched = true;
    }
    for (const req of file.requirements) {
      for (const subject of req.subjects || []) {
        const target = resolveLink({ ref: subject }, String(fm.context), repo).target;
        if (target && seeds.has(keyOf(target))) matched = true;
      }
    }
    if (matched && !seeds.has(keyOf(source))) dependents.set(keyOf(source), source);
  }
  return [...dependents.values()];
}

export function decisionReport(repo, id) {
  const entity = resolveDecision(repo, id);
  const index = decisionIndex(repo);
  const record = index.get(keyOf(entity));
  const affects = relationTargets(entity, 'affects', repo);
  const affectedKeys = new Set(affects.map(keyOf));
  const reverse = reverseDependents(repo, affectedKeys).filter((item) => keyOf(item) !== record.id);
  const relatedDecisions = reverse.filter((item) => item.kind === repo.decisionKind);
  const dependents = reverse.filter((item) => item.kind !== repo.decisionKind);
  const requirements = requirementsDecidedBy(repo, record.id);
  const requirementIds = new Set(requirements.map((req) => req.id));
  const traceGaps = buildTrace(repo).filter((row) => requirementIds.has(row.id) && row.gaps.length > 0);
  const acceptedIncoming = record.incoming.filter((edge) => {
    const source = index.get(edge.source);
    return source?.acceptedStatus && source.declaredStatus === source.acceptedStatus;
  });
  const proposedIncoming = record.incoming.filter((edge) => {
    const source = index.get(edge.source);
    return source?.proposedStatus && source.declaredStatus === source.proposedStatus;
  });

  const allImpact = new Map([...affects, ...dependents].map((item) => [keyOf(item), item]));
  const byKind = {};
  for (const impacted of allImpact.values()) (byKind[impacted.kind] ??= []).push(keyOf(impacted));
  for (const values of Object.values(byKind)) values.sort();

  return {
    id: record.id,
    name: entity.name,
    path: entity.path,
    declaredStatus: record.declaredStatus,
    effectiveStatus: effectiveDecisionStatus(record, index),
    replaces: record.replaces,
    revokes: record.revokes,
    replacedOrRevokedBy: acceptedIncoming,
    pendingSuccessors: proposedIncoming,
    affects: affects.map((item) => ({ id: keyOf(item), kind: item.kind, path: item.path })),
    relatedDecisions: relatedDecisions.map((item) => ({ id: keyOf(item), path: item.path })),
    dependents: dependents.map((item) => ({ id: keyOf(item), kind: item.kind, path: item.path })),
    impactByKind: byKind,
    requirements,
    traceGaps: traceGaps.map((row) => ({ id: row.id, gaps: row.gaps })),
  };
}

function list(values) {
  return values.length > 0 ? values.join(', ') : '—';
}

export function formatDecisionReport(report) {
  const lines = [
    `Decision: ${report.id} — ${report.name}`,
    `File: ${report.path}`,
    `Status: ${report.declaredStatus} (effective: ${report.effectiveStatus})`,
    `Replaces: ${list(report.replaces)}`,
    `Revokes: ${list(report.revokes)}`,
    `Replaced or revoked by accepted decisions: ${list(report.replacedOrRevokedBy.map((edge) => `${edge.source} [${edge.relation}]`))}`,
    `Pending successors: ${list(report.pendingSuccessors.map((edge) => `${edge.source} [${edge.relation}]`))}`,
    '',
    `Direct impact (${report.affects.length}):`,
    ...report.affects.map((item) => `- ${item.id} (${item.kind})`),
    '',
    `Related decisions through affected nodes (${report.relatedDecisions.length}):`,
    ...report.relatedDecisions.map((item) => `- ${item.id}`),
    '',
    `Dependent nodes, one hop (${report.dependents.length}):`,
    ...report.dependents.map((item) => `- ${item.id} (${item.kind})`),
    '',
    `Requirements created by this decision (${report.requirements.length}):`,
    ...report.requirements.map((req) => `- ${req.id} — ${req.title} [${req.owner}]`),
    '',
    `Trace gaps: ${report.traceGaps.length}`,
    ...report.traceGaps.map((row) => `- ${row.id}: ${row.gaps.join(', ')}`),
  ];
  return lines.join('\n');
}
