import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRepo, buildGraph } from './graph.mjs';
import { buildDeliveryReport } from './delivery.mjs';
import { requirementFingerprint } from './requirement-semantic.mjs';
import { lint } from './lint.mjs';
import { checkProfileKeyOwnership } from './profile-registry.mjs';

const profile = `
sources: [terms, deliveries, decisions]
contexts:
  server: { prefix: [TEN] }
kinds:
  entity: {}
  blueprint: { computes_obligations: true }
  adr:
    append_only: true
    lifecycle: [draft, accepted, retired]
    lifecycle_roles: { proposed: draft, accepted: accepted }
  shipment:
    lifecycle: [planned, in-progress, completed, cancelled]
delivery:
  kind: shipment
  status_roles:
    active: [planned, in-progress]
    completed: [completed]
    cancelled: [cancelled]
repositories:
  - { id: backend, path: . }
`;
const requirement = `---
id: tenant
kind: entity
context: server
requirements:
  TEN-126:
    kind: invariant
    subjects: [server.tenant]
    decided_by: [server.ADR-1]
---
# Tenant
## TEN-126 — Isolation
Tenant data MUST remain isolated.
`;
const decision = (id = 'ADR-1', status = 'accepted', relation = '') => `---
id: ${id}
kind: adr
context: server
status: ${status}
${relation}
---
# Decision
`;
const stale = `spec9-requirement-v1:sha256:${'0'.repeat(64)}`;
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-delivery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['terms', 'deliveries', 'decisions']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'profile.yaml'), options.profile ?? profile);
  fs.writeFileSync(path.join(root, 'terms/tenant.md'), options.requirement ?? requirement);
  fs.writeFileSync(path.join(root, 'decisions/one.md'), decision('ADR-1', options.decisionStatus));
  const load = () => loadRepo(root);
  const repo = load();
  const entry = repo.requirementsById.get('server.TEN-126');
  const owner = repo.entities.find((entity) => entity.path === entry.file.path);
  const fingerprint = requirementFingerprint(owner, entry.req);
  const delivery = (id = 'one', status = 'planned', cover = `  server.TEN-126:\n    fingerprint: ${fingerprint}`, extra = '') => {
    fs.writeFileSync(path.join(root, `deliveries/${id}.md`), `---
id: ${id}
kind: shipment
context: server
status: ${status}
owner: Team
covers:
${cover}
${extra}
---
# Delivery
`);
  };
  return { root, load, fingerprint, delivery, report: () => buildDeliveryReport(load()) };
}
const codes = (report) => report.diagnostics.map((finding) => finding.code);

test('delivery is opt-in and registers profile keys', (t) => {
  const f = fixture(t);
  const repo = f.load();
  assert.deepEqual(checkProfileKeyOwnership(repo.profile).unregistered, []);
  delete repo.profile.delivery;
  assert.deepEqual(buildDeliveryReport(repo), {
    enabled: false, summary: { current: 0, missing: 0, stale: 0, duplicate: 0, invalid: 0 }, diagnostics: [],
  });
});

test('current active coverage, repository IDs, safe plan and reverse graph indexes', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'plan.md'), '# Plan');
  f.delivery('one', 'in-progress', undefined, 'plan: plan.md\nrepositories: [backend]');
  const repo = f.load();
  assert.deepEqual(buildDeliveryReport(repo).summary, { current: 1, missing: 0, stale: 0, duplicate: 0, invalid: 0 });
  assert.deepEqual(buildDeliveryReport(repo).diagnostics, []);
  assert.equal(repo.deliveriesByRequirement.get('server.TEN-126')[0].id, 'one');
  assert.ok(buildGraph(repo).edges.some((edge) => edge.type === 'delivery' && edge.relation === 'covers' && edge.to === 'server.TEN-126'));
  assert.deepEqual(lint(repo).filter((finding) => finding.code.startsWith('E-DELIVERY-')), []);
});

test('accepted decisions require coverage; proposed, replaced and revoked decisions do not', (t) => {
  const f = fixture(t);
  assert.equal(f.report().summary.missing, 1);
  fs.writeFileSync(path.join(f.root, 'decisions/one.md'), decision('ADR-1', 'draft'));
  assert.equal(f.report().summary.missing, 0);
  fs.writeFileSync(path.join(f.root, 'decisions/one.md'), decision());
  for (const relation of ['replaces', 'revokes']) {
    fs.writeFileSync(path.join(f.root, 'decisions/two.md'), decision('ADR-2', 'accepted', `relations:\n  ${relation}: [server.ADR-1]`));
    assert.equal(f.report().summary.missing, 0);
    fs.writeFileSync(path.join(f.root, 'decisions/two.md'), decision('ADR-2', 'draft', `relations:\n  ${relation}: [server.ADR-1]`));
    assert.equal(f.report().summary.missing, 1);
  }
});

test('pattern obligations and requirements without decided_by do not require delivery', (t) => {
  const pattern = fixture(t, { requirement: requirement.replace('kind: entity', 'kind: blueprint') });
  assert.equal(pattern.report().summary.missing, 0);
  const unbound = fixture(t, { requirement: requirement.replace('    decided_by: [server.ADR-1]\n', '') });
  assert.equal(unbound.report().summary.missing, 0);
});

test('stale active coverage is an error; completed is historical; cancelled contributes nothing', (t) => {
  const f = fixture(t);
  for (const status of ['planned', 'completed', 'cancelled']) {
    f.delivery('one', status, `  server.TEN-126:\n    fingerprint: ${stale}`);
    const report = f.report();
    assert.equal(report.summary.current, 0);
    assert.equal(report.summary.missing, 1);
    assert.equal(report.summary.stale, status === 'planned' ? 1 : 0);
    assert.equal(codes(report).includes('E-DELIVERY-FINGERPRINT-STALE'), status === 'planned');
  }
  f.delivery('one', 'completed');
  assert.deepEqual(f.report().summary, { current: 1, missing: 0, stale: 0, duplicate: 0, invalid: 0 });
  f.delivery('one', 'cancelled');
  assert.equal(f.report().summary.current, 0);
  assert.equal(f.report().summary.missing, 1);
});

test('completed current coverage counts once and only active assignments can duplicate', (t) => {
  const f = fixture(t);
  f.delivery('one', 'completed');
  f.delivery('two', 'completed');
  assert.deepEqual(f.report().summary, { current: 1, missing: 0, stale: 0, duplicate: 0, invalid: 0 });
  f.delivery('three', 'planned');
  assert.deepEqual(f.report().summary, { current: 1, missing: 0, stale: 0, duplicate: 0, invalid: 0 });
  f.delivery('three', 'planned', `  server.TEN-126:\n    fingerprint: ${stale}`);
  assert.deepEqual(f.report().summary, { current: 1, missing: 0, stale: 1, duplicate: 0, invalid: 0 });
  assert.ok(codes(f.report()).includes('E-DELIVERY-FINGERPRINT-STALE'));
  f.delivery('four', 'in-progress');
  assert.deepEqual(f.report().summary, { current: 0, missing: 0, stale: 1, duplicate: 1, invalid: 0 });
  assert.ok(codes(f.report()).includes('E-DELIVERY-COVERAGE-DUPLICATE'));
});

test('completed deliveries must have valid metadata and coverage to count', (t) => {
  const f = fixture(t);
  for (const [cover, extra, code] of [
    [undefined, 'repositories: [missing]', 'REPOSITORY-UNKNOWN'],
    [undefined, 'plan: missing.md', 'PLAN-BROKEN'],
    ['  server.TEN-126:\n    fingerprint: BAD', '', 'FINGERPRINT-INVALID'],
    [`  server.TEN-126:\n    fingerprint: ${f.fingerprint}\n    ignored: true`, '', 'SHAPE'],
  ]) {
    f.delivery('one', 'completed', cover, extra);
    const report = f.report();
    assert.equal(report.summary.current, 0);
    assert.equal(report.summary.missing, 1);
    assert.ok(codes(report).includes(`E-DELIVERY-${code}`), JSON.stringify(report));
  }
});

test('duplicate active assignments are rejected even when stale', (t) => {
  const f = fixture(t);
  f.delivery();
  f.delivery('two', 'planned', `  server.TEN-126:\n    fingerprint: ${stale}`);
  assert.equal(f.report().summary.duplicate, 1);
  assert.equal(f.report().summary.current, 0);
  assert.ok(codes(f.report()).includes('E-DELIVERY-COVERAGE-DUPLICATE'));
  f.delivery('one', 'planned', `  server.TEN-126:\n    fingerprint: ${stale}`);
  assert.deepEqual(f.report().summary, { current: 0, missing: 1, stale: 2, duplicate: 1, invalid: 0 });
  f.delivery();
  f.delivery('two', 'cancelled');
  assert.equal(f.report().summary.duplicate, 0);
  assert.equal(f.report().summary.current, 1);
});

test('delivery coverage requires qualified known IDs and strict fingerprints', (t) => {
  const f = fixture(t);
  const cases = [
    ['  TEN-126:\n    fingerprint: BAD', 'REQUIREMENT-UNQUALIFIED'],
    [`  server.TEN-999:\n    fingerprint: ${f.fingerprint}`, 'REQUIREMENT-UNKNOWN'],
    ['  server.TEN-126: {}', 'FINGERPRINT-INVALID'],
    ['  server.TEN-126:\n    fingerprint: sha256:123', 'FINGERPRINT-INVALID'],
    [`  server.TEN-126:\n    fingerprint: ${f.fingerprint.toUpperCase()}`, 'FINGERPRINT-INVALID'],
    [`  server.TEN-126:\n    fingerprint: ${f.fingerprint}\n    ignored: true`, 'SHAPE'],
    ['  - server.TEN-126', 'SHAPE'],
  ];
  for (const [cover, code] of cases) {
    f.delivery('one', 'planned', cover);
    const report = f.report();
    assert.ok(codes(report).includes(`E-DELIVERY-${code}`), JSON.stringify(report));
    assert.equal(report.summary.current, 0);
    assert.ok(report.summary.invalid > 0);
  }
});

test('malformed requirement owners produce diagnostics for every delivery status', (t) => {
  const f = fixture(t);
  for (const field of ['id: tenant\n', 'kind: entity\n']) {
    fs.writeFileSync(path.join(f.root, 'terms/tenant.md'), requirement.replace(field, ''));
    for (const status of ['planned', 'completed', 'cancelled']) {
      f.delivery('one', status);
      const repo = f.load();
      const report = buildDeliveryReport(repo);
      assert.ok(codes(report).includes('E-DELIVERY-SHAPE'));
      assert.equal(report.summary.current, 0);
      assert.ok(lint(repo).some((finding) => finding.code === 'E-DELIVERY-SHAPE'));
    }
  }
});

test('invalid profile delivery lifecycle and nested roles are rejected', (t) => {
  const f = fixture(t);
  const invalidConfigs = [
    null, [], {}, { kind: ['shipment'] }, { kind: 'unknown' },
    { kind: 'shipment', status_roles: { active: ['planned'], completed: ['completed'], cancelled: ['cancelled'] } },
    { kind: 'shipment', status_roles: { active: ['planned', 'in-progress'], completed: ['planned'], cancelled: ['cancelled'] } },
    { kind: 'shipment', status_roles: { active: ['planned', 'in-progress'], completed: ['completed'], cancelled: ['cancelled'], extra: [] } },
    { kind: 'shipment', status_roles: { active: 'planned', completed: ['completed'], cancelled: ['cancelled'] } },
  ];
  for (const config of invalidConfigs) {
    const repo = f.load();
    repo.profile.delivery = config;
    assert.deepEqual(codes(buildDeliveryReport(repo)), ['E-DELIVERY-SHAPE']);
  }
});

test('optional delivery metadata rejects unknown repositories and unsafe or missing plans', (t) => {
  const f = fixture(t);
  for (const [extra, code] of [
    ['repositories: [missing]', 'REPOSITORY-UNKNOWN'],
    ['repositories: backend', 'SHAPE'],
    ['repositories: [backend, backend]', 'SHAPE'],
    ['plan: missing.md', 'PLAN-BROKEN'],
    ['plan: ../outside.md', 'PLAN-BROKEN'],
    [`plan: ${f.root}/profile.yaml`, 'PLAN-BROKEN'],
    ['plan: terms', 'PLAN-BROKEN'],
    ['plan: { path: plan.md }', 'PLAN-BROKEN'],
  ]) {
    f.delivery('one', 'planned', undefined, extra);
    assert.ok(codes(f.report()).includes(`E-DELIVERY-${code}`));
    assert.equal(f.report().summary.current, 0);
  }
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'escape'));
  f.delivery('one', 'planned', undefined, 'plan: escape');
  assert.ok(codes(f.report()).includes('E-DELIVERY-PLAN-BROKEN'));
});
