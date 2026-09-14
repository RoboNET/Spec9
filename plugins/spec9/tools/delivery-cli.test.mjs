import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('./spec.mjs', import.meta.url));
const profile = `
profile: delivery-cli-test
sources: [terms, decisions, deliveries]
relation_types:
  references: { cardinality: many }
contexts:
  sample: { title: Sample, prefix: [REQ] }
kinds:
  component: { title: Component }
  decision:
    title: Decision
    append_only: true
    lifecycle: [proposed, accepted]
  shipment:
    title: Shipment
    lifecycle: [planned, completed, cancelled]
    required_fields: [status, owner, covers]
delivery:
  kind: shipment
  status_roles:
    active: [planned]
    completed: [completed]
    cancelled: [cancelled]
norm_kinds:
  permission: { evidence: [] }
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-delivery-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  write('profile.yaml', profile);
  for (const dir of ['terms', 'decisions', 'deliveries', 'tests/e2e/cases']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  write('tests/e2e/cases/service.yaml', 'cases:\n  - { id: SERVICE-001, title: Request behavior }\n');
  write('src/service.mjs', 'export function handle() {}\n');
  const deliveryIds = new Set();
  const writeDecision = () => write('decisions/choice.md', `---
id: ADR-001
kind: decision
context: sample
name: Choose behavior
status: accepted
relations:
  references: [${['sample.service', ...Array.from(deliveryIds, (id) => `sample.${id}`)].join(', ')}]
---
# Choose behavior
`);
  writeDecision();
  const norm = (extra = false, action = 'accept') => `---
id: service
kind: component
context: sample
name: Service
anchors:
  code: [src/service.mjs#handle]
requirements:
  REQ-001:
    kind: permission
    subjects: [sample.service]
    decided_by: [sample.ADR-001]
    evidence:
      test: [tests/e2e/cases/service.yaml#SERVICE-001]
${extra ? `  REQ-002:
    kind: permission
    subjects: [sample.service]
    decided_by: [sample.ADR-001]
` : ''}---
# Service

### REQ-001 — Request behavior

[[sample.service|The service]] MAY ${action} the request.
${extra ? `
### REQ-002 — Other behavior

[[sample.service|The service]] MAY defer the request.
` : ''}`;
  write('terms/service.md', norm());
  const run = (...args) => spawnSync(process.execPath, [cli, '--spec-root', root, '--product-root', root, ...args], { encoding: 'utf8' });
  const fingerprint = () => {
    const result = run('delivery', 'fingerprint', 'sample.REQ-001');
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const deliver = (fingerprint, id = 'release', status = 'planned', owner = 'team') => {
    write(`deliveries/${id}.md`, `---
id: ${id}
kind: shipment
context: sample
name: Release
status: ${status}
owner: ${JSON.stringify(owner)}
plan: docs/plan.md
covers:
  sample.REQ-001:
    fingerprint: ${fingerprint}
---
# Release
`);
    deliveryIds.add(id);
    writeDecision();
  };
  write('docs/plan.md', 'Implement request behavior.\n');
  return { root, write, run, norm, fingerprint, deliver };
}

test('CLI-005 fingerprint text and JSON are stable, read-only, and reject invalid requests', (t) => {
  const f = fixture(t);
  const before = fs.readFileSync(path.join(f.root, 'terms/service.md'), 'utf8');
  const value = f.fingerprint();
  assert.match(value, /^spec9-requirement-v1:sha256:[0-9a-f]{64}$/);
  assert.equal(f.fingerprint(), value);
  const json = f.run('delivery', 'fingerprint', 'sample.REQ-001', '--json');
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), { id: 'sample.REQ-001', fingerprint: value });
  assert.equal(f.run('delivery', 'fingerprint', 'REQ-001').status, 1);
  assert.equal(f.run('delivery', 'fingerprint', 'sample.REQ-404').status, 1);
  for (const args of [[], ['fingerprint'], ['unknown', 'sample.REQ-001'], ['fingerprint', 'sample.REQ-001', '--fix']]) {
    assert.equal(f.run('delivery', ...args).status, 2);
  }
  assert.equal(fs.readFileSync(path.join(f.root, 'terms/service.md'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'deliveries')), []);
  // Fingerprint authoring remains available before the opt-in profile is enabled.
  f.write('profile.yaml', profile.replace(/delivery:\n[\s\S]*?(?=norm_kinds:)/, ''));
  assert.equal(f.fingerprint(), value);
});

test('CLI-005 acceptance workflow detects stale, missing, and duplicate editions', (t) => {
  const f = fixture(t);
  const assertHealthy = () => {
    const lint = f.run('lint');
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
    const doctor = f.run('doctor', '--strict', '--json');
    assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).integrity.errors, 0);
  };
  f.deliver(f.fingerprint());
  assertHealthy();
  f.write('terms/service.md', f.norm(false, 'reject'));
  assert.equal(f.run('lint').status, 1);
  assert.match(f.run('lint').stdout, /E-DELIVERY-FINGERPRINT-STALE/);
  const stale = f.run('doctor', '--strict', '--json');
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).delivery.summary.stale, 1);
  assert.match(f.run('doctor').stdout, /delivery\s+0 current \/ 1 missing \/ 1 stale \/ 0 duplicate/);
  f.write('docs/plan.md', 'Implement rejection instead of acceptance.\n');
  f.deliver(f.fingerprint());
  assertHealthy();
  f.write('terms/service.md', f.norm(true, 'reject'));
  assert.equal(f.run('lint').status, 1);
  assert.match(f.run('lint').stdout, /E-DELIVERY-COVERAGE-MISSING/);
  f.deliver(f.fingerprint(), 'second-release');
  const duplicate = f.run('lint');
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stdout, /E-DELIVERY-COVERAGE-DUPLICATE/);
});

test('CLI-005 completed editions cover until the norm changes and a new delivery takes over', (t) => {
  const f = fixture(t);
  const check = (expected, errorCode) => {
    const lint = f.run('lint');
    assert.equal(lint.status, errorCode ? 1 : 0, lint.stdout + lint.stderr);
    if (errorCode) assert.ok(lint.stdout.includes(errorCode), lint.stdout);
    const doctor = f.run('doctor', '--strict', '--json');
    assert.equal(doctor.status, errorCode ? 1 : 0, doctor.stdout + doctor.stderr);
    const report = JSON.parse(doctor.stdout);
    assert.deepEqual(report.delivery.summary, {
      current: 1, missing: 0, stale: 0, duplicate: 0, invalid: 0, ...expected,
    });
    if (!errorCode) assert.equal(report.integrity.errors, 0);
  };
  const original = f.fingerprint();
  f.deliver(original);
  check({});
  f.deliver(original, 'release', 'completed');
  check({});
  f.write('terms/service.md', f.norm(false, 'reject'));
  check({ current: 0, missing: 1 }, 'E-DELIVERY-COVERAGE-MISSING');
  const current = f.fingerprint();
  f.deliver(current, 'next-release');
  check({});
  f.deliver(current, 'next-release', 'completed');
  f.deliver(current, 'another-completed', 'completed');
  check({});
  f.deliver(current, 'active-release');
  check({});
  f.deliver(original, 'active-release');
  check({ stale: 1 }, 'E-DELIVERY-FINGERPRINT-STALE');
  f.deliver(current, 'second-active');
  check({ current: 0, stale: 1, duplicate: 1 }, 'E-DELIVERY-COVERAGE-DUPLICATE');
  f.deliver(current, 'active-release', 'cancelled');
  f.deliver(current, 'second-active', 'cancelled');
  f.deliver(current, 'next-release', 'cancelled');
  f.deliver(current, 'another-completed', 'cancelled');
  check({ current: 0, missing: 1 }, 'E-DELIVERY-COVERAGE-MISSING');
  f.deliver(current, 'next-release', 'completed', '');
  check({ current: 0, missing: 1, invalid: 1 }, 'E-DELIVERY-SHAPE');
  f.deliver('BAD', 'next-release', 'completed');
  check({ current: 0, missing: 1, invalid: 1 }, 'E-DELIVERY-FINGERPRINT-INVALID');
});
