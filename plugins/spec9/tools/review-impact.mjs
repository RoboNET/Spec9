import { buildTrace } from './trace.mjs';
import { traceFlow } from './flow.mjs';

function normalize(raw) {
  return String(raw).trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function anchorFile(target) {
  return String(target).split('#')[0];
}

/** Structured impact: contexts first, then terms and requirements. */
export function buildReviewImpact(repo, changedFiles) {
  const changed = [...new Set(changedFiles.map(normalize).filter(Boolean))].sort();
  const changedSet = new Set(changed);
  const trace = buildTrace(repo);
  const contexts = new Map();
  const matchedFiles = new Set();

  function contextFor(context) {
    if (!contexts.has(context)) contexts.set(context, { id: context, terms: new Map(), requirements: [], decisions: new Set() });
    return contexts.get(context);
  }

  function addTerm(ctx, entity, reasons) {
    const existing = ctx.terms.get(entity.id);
    if (existing) {
      existing.reasons = [...new Set([...existing.reasons, ...reasons])];
      return;
    }
    ctx.terms.set(entity.id, { id: entity.id, kind: entity.kind, path: entity.path, reasons: [...new Set(reasons)] });
  }

  // Сначала сопоставляем сами страницы и якоря сущностей. Иначе термин или
  // ADR без requirements исчезает из review только потому, что для него нет
  // строки в trace-матрице.
  for (const entity of repo.entities) {
    const reasons = [];
    const ownerSpecPath = `${repo.specPathPrefix}${entity.path}`;
    if (changedSet.has(entity.path) || changedSet.has(ownerSpecPath)) {
      reasons.push(`spec:${entity.path}`);
      matchedFiles.add(changedSet.has(ownerSpecPath) ? ownerSpecPath : entity.path);
    }
    for (const anchor of entity.file.frontmatterAnchors) {
      const file = anchorFile(anchor.target);
      if (!changedSet.has(file)) continue;
      reasons.push(`anchor:${anchor.type}:${anchor.target}`);
      matchedFiles.add(file);
    }
    if (!reasons.length) continue;
    const qualifiedEntity = { ...entity, id: `${entity.context}.${entity.id}` };
    const ctx = contextFor(entity.context);
    addTerm(ctx, qualifiedEntity, reasons);
    if (entity.kind === repo.decisionKind) ctx.decisions.add(qualifiedEntity.id);
  }

  for (const row of trace) {
    const ownerSpecPath = `${repo.specPathPrefix}${row.owner.path}`;
    const reasons = [];
    if (changedSet.has(row.owner.path) || changedSet.has(ownerSpecPath)) {
      reasons.push(`spec:${row.owner.path}`);
      matchedFiles.add(changedSet.has(ownerSpecPath) ? ownerSpecPath : row.owner.path);
    }
    for (const anchor of row.evidence) {
      const file = anchorFile(anchor.target);
      if (changedSet.has(file)) {
        reasons.push(`evidence:${anchor.type}:${anchor.target}`);
        matchedFiles.add(file);
      }
    }
    for (const subject of row.subjects) {
      for (const anchor of subject.anchors) {
        const file = anchorFile(anchor.target);
        if (changedSet.has(file)) {
          reasons.push(`subject:${subject.id}:${anchor.type}:${anchor.target}`);
          matchedFiles.add(file);
        }
      }
    }
    if (reasons.length === 0) continue;

    const context = row.owner.context || row.owner.id.split('.')[0];
    const ctx = contextFor(context);
    addTerm(ctx, row.owner, reasons);
    ctx.requirements.push({ id: row.id, title: row.title, kind: row.kind, owner: row.owner.id, reasons: [...new Set(reasons)], gaps: row.gaps, outcomes: row.outcomes, decisions: row.decisions });
    for (const decision of row.decisions) ctx.decisions.add(decision);
  }

  const resultContexts = [...contexts.values()].sort((a, b) => a.id.localeCompare(b.id)).map((ctx) => ({
    id: ctx.id,
    title: repo.profile.contexts?.[ctx.id]?.title || ctx.id,
    terms: [...ctx.terms.values()].sort((a, b) => a.id.localeCompare(b.id)),
    requirements: ctx.requirements.sort((a, b) => a.id.localeCompare(b.id)),
    decisions: [...ctx.decisions].sort(),
  }));
  const impactedTerms = new Map(resultContexts.flatMap((context) => context.terms.map((term) => [term.id, term])));
  const impactedRequirements = resultContexts.flatMap((context) => context.requirements);
  const capabilityDefinitions = Array.isArray(repo.profile.review?.capabilities) ? repo.profile.review.capabilities : [];
  const capabilities = [];
  for (const definition of capabilityDefinitions) {
    if (!definition || typeof definition !== 'object') continue;
    const entrypoint = String(definition.entrypoint || '');
    const scope = new Set([entrypoint, ...(Array.isArray(definition.members) ? definition.members.map(String) : [])].filter(Boolean));
    const causal = new Map();
    for (const seed of [...scope]) {
      try {
        const flow = traceFlow(repo, seed);
        for (const node of flow.nodes) scope.add(node);
        for (const edge of flow.edges) causal.set(`${edge.from}\0${edge.relation}\0${edge.to}`, edge);
      } catch {
        // Lint owns invalid configured handles. Review remains renderable so a
        // profile error can be inspected instead of masking all other impact.
      }
    }
    const terms = [...impactedTerms.values()].filter((term) => scope.has(term.id));
    const requirements = impactedRequirements.filter((requirement) => scope.has(requirement.owner));
    if (!terms.length && !requirements.length) continue;
    const touched = new Set([...terms.map((term) => term.id), ...requirements.map((requirement) => requirement.owner)]);
    const decisions = [...new Set(requirements.flatMap((requirement) => requirement.decisions || []))].sort();
    const boundaries = terms.filter((term) => repo.profile.kinds?.[term.kind]?.review_role === 'boundary').map((term) => term.id).sort();
    const causalChains = [...causal.values()].filter((edge) => touched.has(edge.from) || touched.has(edge.to));
    const entryEntity = repo.entities.find((entity) => `${entity.context}.${entity.id}` === entrypoint);
    const drillDown = entryEntity?.kind === repo.decisionKind
      ? `spec9 decision ${entrypoint}`
      : causal.size > 0
        ? `spec9 flow ${entrypoint}`
        : `spec9 context ${entrypoint} --slice review`;
    capabilities.push({
      id: String(definition.id),
      title: String(definition.title),
      entrypoint,
      terms: terms.map((term) => term.id).sort(),
      requirements: requirements.map((requirement) => requirement.id).sort(),
      boundaries,
      decisions,
      causalChains,
      drillDown,
    });
  }
  return {
    changedFiles: changed,
    matchedFiles: [...matchedFiles].sort(),
    unmappedFiles: changed.filter((file) => !matchedFiles.has(file)),
    capabilities,
    contexts: resultContexts,
  };
}

export function formatReviewImpact(report) {
  const affected = report.contexts.reduce((sum, ctx) => sum + ctx.requirements.length, 0);
  const lines = [
    `Review impact: ${report.changedFiles.length} files → ${(report.capabilities || []).length} capabilities → ${report.contexts.length} contexts → ${affected} requirements`,
  ];
  lines.push('', '## Capability overview');
  if (!(report.capabilities || []).length) lines.push('- no configured capability matched the changed domain handles');
  for (const capability of report.capabilities || []) {
    lines.push(`- **${capability.id} — ${capability.title}**: ${capability.terms.length} terms, ${capability.requirements.length} requirements`);
    lines.push(`  - entrypoint: ${capability.entrypoint}`);
    if (capability.boundaries.length) lines.push(`  - boundaries: ${capability.boundaries.join(', ')}`);
    if (capability.decisions.length) lines.push(`  - decisions: ${capability.decisions.join(', ')}`);
    for (const edge of capability.causalChains.slice(0, 4)) lines.push(`  - causal: ${edge.from} --${edge.relation}--> ${edge.to}`);
    if (capability.causalChains.length > 4) lines.push(`  - causal: … ${capability.causalChains.length - 4} more edges`);
    lines.push(`  - drill down: ${capability.drillDown}`);
  }
  if (report.unmappedFiles.length) {
    const visible = report.unmappedFiles.slice(0, 20);
    lines.push('', `## Unmapped files (${report.unmappedFiles.length})`, ...visible.map((file) => `- ${file}`));
    if (report.unmappedFiles.length > visible.length) lines.push(`- … ${report.unmappedFiles.length - visible.length} more; use --json for the complete machine-readable list`);
  }
  lines.push('', '## Context drill-down');
  for (const ctx of report.contexts) {
    lines.push('', `### ${ctx.id} — ${ctx.title}: ${ctx.terms.length} terms, ${ctx.requirements.length} requirements`);
    lines.push(`Terms: ${ctx.terms.map((term) => term.id).join(', ') || '—'}`);
    if (ctx.decisions.length) lines.push(`Decisions: ${ctx.decisions.join(', ')}`);
    for (const req of ctx.requirements.slice(0, 10)) {
      lines.push(`- ${req.id} — ${req.title} [${req.kind}]`);
      if (req.gaps.length) lines.push(`  - gaps: ${req.gaps.join(', ')}`);
      lines.push(`  - details: spec9 context ${req.id} --slice review`);
    }
    if (ctx.requirements.length > 10) lines.push(`- … ${ctx.requirements.length - 10} more requirements; use review --json or a capability entrypoint to continue`);
  }
  return lines.join('\n');
}
