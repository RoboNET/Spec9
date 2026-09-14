import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRepo, buildGraph } from './graph.mjs';
import { lint } from './lint.mjs';
import { draftPage } from './draft.mjs';
import { parseFrontmatter } from './yaml.mjs';
import { buildDeliveryReport } from './delivery.mjs';
import { checkProfileKeyOwnership } from './profile-registry.mjs';

// Deliberately not called "initiative": all vocabulary belongs to the profile.
const profile = `
sources: [ideas, terms, decisions, deliveries]
contexts:
  sample: { title: Sample, prefix: [REQ] }
kinds:
  proposal:
    lifecycle: [inbox, exploring, delivering, closed, dropped]
    required_fields: [name, status]
  component: {}
  choice:
    append_only: true
    lifecycle: [proposed, accepted, superseded]
    lifecycle_roles: { proposed: proposed, accepted: accepted }
  shipment:
    lifecycle: [planned, completed, cancelled]
delivery:
  kind: shipment
  status_roles:
    active: [planned]
    completed: [completed]
    cancelled: [cancelled]
relation_types:
  motivated_by: { cardinality: many, sources: [choice, shipment], targets: [proposal] }
  references: { cardinality: many }
norm_kinds:
  permission: { evidence: [] }
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-initiative-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['ideas', 'terms', 'decisions', 'deliveries']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'profile.yaml'), profile);
  return {
    load: () => loadRepo(root),
    write: (file, text) => fs.writeFileSync(path.join(root, file), text),
  };
}

test('an idea can be drafted and linted without ADR, requirements, owner, or delivery', (t) => {
  const f = fixture(t);
  const draft = draftPage(f.load(), 'proposal', 'sample.simpler-onboarding', 'Simplify onboarding');
  const { frontmatter } = parseFrontmatter(draft);
  assert.equal(frontmatter.name, 'Simplify onboarding');
  assert.equal(frontmatter.status, 'inbox');
  for (const field of ['owner', 'requirements', 'covers', 'plan']) assert.equal(frontmatter[field], undefined);
  f.write('ideas/onboarding.md', draft.replace('TODO', 'Explore a simpler first action.'));
  for (const status of ['inbox', 'exploring', 'delivering', 'closed', 'dropped']) {
    f.write('ideas/onboarding.md', draft.replace('status: inbox', `status: ${status}`).replace('TODO', 'A rough idea.'));
    const repo = f.load();
    assert.deepEqual(checkProfileKeyOwnership(repo.profile).unregistered, []);
    assert.deepEqual(lint(repo).filter((finding) => finding.level === 'ERROR'), []);
    assert.equal(buildDeliveryReport(repo).summary.missing, 0);
    assert.equal(repo.requirementsById.size, 0);
  }
  f.write('ideas/onboarding.md', draft.replace('status: inbox', 'status: unknown'));
  assert.ok(lint(f.load()).some((finding) => finding.code === 'E-LIFECYCLE-STATUS'));
});

test('ordinary lifecycle roles are optional but declared role targets are still validated', (t) => {
  const f = fixture(t);
  f.write('profile.yaml', profile.replace('required_fields: [name, status]', 'required_fields: [name, status]\n    lifecycle_roles: { intake: absent }'));
  assert.ok(lint(f.load()).some((finding) => finding.code === 'E-LIFECYCLE-ROLES'));
});

test('initiative relations connect work without accepting ADRs or supplying coverage', (t) => {
  const f = fixture(t);
  f.write('ideas/onboarding.md', draftPage(f.load(), 'proposal', 'sample.onboarding', 'Onboarding'));
  const adr = `---
id: ADR-001
kind: choice
context: sample
name: Onboarding choice
status: proposed
relations:
  motivated_by: [sample.onboarding]
---
# Onboarding choice
Explore the alternatives.
`;
  f.write('decisions/onboarding.md', adr);
  f.write('terms/service.md', `---
id: service
kind: component
context: sample
name: Service
requirements:
  REQ-001:
    kind: permission
    subjects: [sample.service]
    decided_by: [sample.ADR-001]
---
# Service
### REQ-001 — First action
[[sample.service|The service]] MAY offer a guided first action.
`);
  assert.equal(buildDeliveryReport(f.load()).summary.missing, 0);
  assert.ok(buildGraph(f.load()).edges.some((edge) =>
    edge.from === 'sample.ADR-001' && edge.to === 'sample.onboarding' && edge.type === 'relation:motivated_by'));
  f.write('decisions/onboarding.md', adr.replace('status: proposed', 'status: accepted'));
  assert.equal(buildDeliveryReport(f.load()).summary.missing, 1);
  f.write('decisions/onboarding.md', adr.replace('sample.onboarding', 'sample.unknown'));
  assert.ok(lint(f.load()).some((finding) => finding.level === 'ERROR'));
});
