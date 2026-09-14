import { decisionIndex, effectiveDecisionStatus } from './decision.mjs';
import { requirementFingerprint } from './requirement-semantic.mjs';
import { resolveExistingWithinRoot } from './safe-path.mjs';

const FINGERPRINT = /^spec9-requirement-v1:sha256:[0-9a-f]{64}$/;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());

/**
 * Delivery coverage is an assignment to an exact requirement edition, not proof
 * of implementation. Valid active and completed work cover the current edition;
 * older completed work is history, and cancelled work never supplies coverage.
 * Summary current/missing/duplicate count requirements; stale counts active assignments;
 * invalid counts malformed delivery/profile diagnostics.
 */
export function buildDeliveryReport(repo) {
  const diagnostics = [];
  const summary = { current: 0, missing: 0, stale: 0, duplicate: 0, invalid: 0 };
  const enabled = repo.profile.delivery !== undefined;
  const report = { enabled, summary, diagnostics };
  if (!enabled) return report;
  const emit = (file, code, message, line = 1, level = 'ERROR') => {
    diagnostics.push({ path: file, line, level, code: `E-DELIVERY-${code}`, message });
    if (!['FINGERPRINT-STALE', 'COVERAGE-MISSING', 'COVERAGE-DUPLICATE'].includes(code)) summary.invalid++;
  };
  const config = repo.profile.delivery;
  if (!object(config) || Object.keys(config).some((key) => !['kind', 'status_roles'].includes(key))
    || typeof config.kind !== 'string' || !config.kind.trim() || !repo.profile.kinds?.[config.kind]) {
    emit('profile.yaml', 'SHAPE', 'delivery must declare one known string kind and status_roles only');
    return report;
  }
  const roles = config.status_roles;
  const lifecycle = repo.profile.kinds[config.kind].lifecycle;
  const roleNames = ['active', 'completed', 'cancelled'];
  if (!object(roles) || Object.keys(roles).some((key) => !roleNames.includes(key))
    || !strings(lifecycle) || !lifecycle.length
    || roleNames.some((role) => !strings(roles[role]) || !roles[role].length)
    || new Set(lifecycle).size !== lifecycle.length) {
    emit('profile.yaml', 'SHAPE', 'delivery status_roles must contain non-empty active, completed and cancelled string lists and the kind must declare a lifecycle');
    return report;
  }
  const statuses = roleNames.flatMap((role) => roles[role]);
  if (new Set(statuses).size !== statuses.length || statuses.some((status) => !lifecycle.includes(status))
    || lifecycle.some((status) => !statuses.includes(status))) {
    emit('profile.yaml', 'SHAPE', 'delivery status roles must partition the declared lifecycle without overlap or unknown statuses');
    return report;
  }
  const decisions = decisionIndex(repo);
  const required = new Map();
  const owners = new Map(repo.entities.map((entity) => [entity.path, entity]));
  for (const [id, entry] of repo.requirementsById) {
    if (entry.file.frontmatter?.kind === repo.patternKind) continue;
    if ((entry.req.decidedBy || []).some((ref) => {
      const record = decisions.get(ref);
      return record?.acceptedStatus && effectiveDecisionStatus(record, decisions) === record.acceptedStatus;
    })) required.set(id, entry);
  }
  const active = new Map();
  const current = new Set();
  const repositories = new Set((Array.isArray(repo.profile.repositories) ? repo.profile.repositories : []).map((entry) => entry?.id));
  for (const entity of repo.deliveries || []) {
    const fm = entity.file.frontmatter;
    const line = entity.file.frontmatterStartLine || 1;
    let valid = true;
    const invalid = (code, message) => { valid = false; emit(entity.path, code, message, line); };
    const role = roleNames.find((name) => roles[name].includes(fm.status));
    if (!role) invalid('SHAPE', `Unknown delivery status: ${JSON.stringify(fm.status)}`);
    if (typeof fm.owner !== 'string' || !fm.owner.trim()) invalid('SHAPE', 'Delivery owner must be a non-empty string');
    if (fm.repositories !== undefined) {
      if (!strings(fm.repositories) || new Set(fm.repositories).size !== fm.repositories.length) invalid('SHAPE', 'repositories must be a list of unique repository IDs');
      else for (const id of fm.repositories) if (!repositories.has(id)) invalid('REPOSITORY-UNKNOWN', `Unknown delivery repository: ${id}`);
    }
    if (fm.plan !== undefined) {
      try {
        if (typeof fm.plan !== 'string' || fm.plan.includes('\\')) throw new Error('plan must be a relative file path using forward slashes');
        resolveExistingWithinRoot(repo.productRoot, fm.plan, { kind: 'file', label: 'delivery plan' });
      } catch (error) { invalid('PLAN-BROKEN', error.message); }
    }
    if (!object(fm.covers) || !Object.keys(fm.covers).length) {
      invalid('SHAPE', 'covers must be a non-empty mapping keyed by qualified requirement IDs');
      continue;
    }
    for (const [id, cover] of Object.entries(fm.covers)) {
      let coverValid = valid;
      const fail = (code, message) => { coverValid = false; emit(entity.path, code, message, line); };
      if (!/^[^.\s]+\.[^.\s]+$/u.test(id)) {
        fail('REQUIREMENT-UNQUALIFIED', `Delivery requirement must be qualified: ${id}`);
        continue;
      }
      const entry = Map.prototype.get.call(repo.requirementsById, id);
      if (!entry) { fail('REQUIREMENT-UNKNOWN', `Unknown delivery requirement: ${id}`); continue; }
      // Assignment multiplicity is independent of freshness and metadata errors.
      if (role === 'active') {
        if (!active.has(id)) active.set(id, []);
        active.get(id).push(entity);
      }
      if (!object(cover) || Object.keys(cover).some((key) => key !== 'fingerprint')) fail('SHAPE', `covers.${id} must contain fingerprint only`);
      if (!object(cover) || typeof cover.fingerprint !== 'string' || !FINGERPRINT.test(cover.fingerprint)) {
        fail('FINGERPRINT-INVALID', `covers.${id}.fingerprint must be a spec9-requirement-v1 SHA-256 fingerprint`);
        continue;
      }
      const owner = owners.get(entry.file.path);
      if (!owner) {
        fail('SHAPE', `Requirement ${id} has no valid owner; fix its page identity before assigning delivery coverage`);
        continue;
      }
      const fingerprint = requirementFingerprint(owner, entry.req);
      if (cover.fingerprint !== fingerprint) {
        if (role === 'active') summary.stale++;
        if (role === 'active') emit(entity.path, 'FINGERPRINT-STALE', `Delivery coverage for ${id} is stale; expected ${fingerprint}`, line);
        continue;
      }
      if ((role === 'active' || role === 'completed') && coverValid) current.add(id);
    }
  }
  for (const [id, assignments] of active) {
    if (assignments.length < 2) continue;
    summary.duplicate++;
    emit(assignments[0].path, 'COVERAGE-DUPLICATE', `Requirement ${id} has multiple active delivery assignments: ${assignments.map((entity) => `${entity.context}.${entity.id}`).join(', ')}`);
  }
  for (const [id, { file, req }] of required) {
    if (current.has(id) && (active.get(id)?.length ?? 0) < 2) summary.current++;
    else if (!current.has(id)) {
      summary.missing++;
      emit(file.path, 'COVERAGE-MISSING', `Requirement ${id} needs a valid active or completed delivery covering its current fingerprint`, req.headingLine);
    }
  }
  return report;
}
