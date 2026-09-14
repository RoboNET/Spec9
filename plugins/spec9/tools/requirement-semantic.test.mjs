import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseSpecFile } from './parse.mjs';
import { requirementSemantic, requirementFingerprint } from './requirement-semantic.mjs';

function fixture(t, metadata = '', section = '### AUTH-001 — Rule\n[[auth.a]] MUST return ok.\nExplanation.') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-fingerprint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'a.md');
  fs.writeFileSync(target, `---
id: a
context: auth
kind: entity
requirements:
  AUTH-001:
    kind: invariant
    subjects: [auth.b, auth.a]
    outcomes: [ok, denied]
    decided_by: [auth.ADR-002, auth.ADR-001]
    partitions:
      - { outcome: denied, classes: [expired, invalid], total: true }
      - { outcome: ok, classes: [valid], total: false }
${metadata}---
# A
Introduction.
${section}
## Other section
Outside requirement MUST NOT affect its fingerprint.
`);
  const file = parseSpecFile(target, root);
  return { context: 'auth', id: 'a', file };
}

const req = (entity) => entity.file.requirements[0];
const fingerprint = (entity) => requirementFingerprint(entity, req(entity));

test('fingerprint v1 hashes recursively key-sorted UTF-8 canonical JSON', (t) => {
  const entity = fixture(t);
  const semantic = requirementSemantic(entity, req(entity));
  assert.deepEqual(Object.keys(semantic), ['id', 'owner', 'kind', 'title', 'subjects', 'outcomes', 'partitions', 'decidedBy', 'norms', 'prose']);
  assert.equal(semantic.id, 'auth.AUTH-001');
  assert.equal(semantic.owner, 'auth.a');
  assert.deepEqual(semantic.subjects, ['auth.a', 'auth.b']);
  assert.deepEqual(semantic.decidedBy, ['auth.ADR-001', 'auth.ADR-002']);
  assert.deepEqual(semantic.norms, ['[[auth.a]] MUST return ok.']);
  assert.equal(semantic.prose, '### AUTH-001 — Rule [[auth.a]] MUST return ok. Explanation.');
  const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value;
  const expected = createHash('sha256').update(JSON.stringify(sortKeys(semantic)), 'utf8').digest('hex');
  assert.equal(fingerprint(entity), `spec9-requirement-v1:sha256:${expected}`);
});

test('fingerprints ignore whitespace, set order, duplicates, evidence, origins and source locations', (t) => {
  const before = fixture(t);
  const after = fixture(t, '    origins: [external/source]\n    evidence: { test: [test.mjs#test] }\n',
    '### AUTH-001 — Rule\n\n[[auth.a]] MUST   return\nok.\n  Explanation.');
  const changed = req(after);
  changed.subjects.reverse();
  changed.subjects.push(' auth.a ');
  changed.outcomes.values.reverse();
  changed.decidedBy.reverse();
  changed.partitions.reverse();
  changed.partitions[1].classes.reverse();
  changed.partitions.push(structuredClone(changed.partitions[0]));
  after.path = 'moved.md';
  assert.equal(fingerprint(before), fingerprint(after));
});

test('wrapping inline code preserves the canonical meaning and fingerprint', (t) => {
  const before = fixture(t, '', '### AUTH-001 — Rule\n[[auth.a]] MUST return `some value`.');
  const after = fixture(t, '', '### AUTH-001 — Rule\n[[auth.a]] MUST return `some\nvalue`.');
  assert.deepEqual(requirementSemantic(before, req(before)), requirementSemantic(after, req(after)));
  assert.equal(fingerprint(before), fingerprint(after));
});

test('all semantic fields and normative operators affect the fingerprint', (t) => {
  const original = fixture(t);
  const mutations = [
    (entity) => { entity.id = 'other'; },
    (entity) => { req(entity).qualifiedId = 'auth.AUTH-002'; },
    (entity) => { req(entity).kindAttr = 'constraint'; },
    (entity) => { req(entity).title = 'Other rule'; },
    (entity) => { req(entity).subjects.push('auth.c'); },
    (entity) => { req(entity).outcomes.values.push('failed'); },
    (entity) => { req(entity).decidedBy.push('auth.ADR-003'); },
    (entity) => { req(entity).partitions[0].total = false; },
    (entity) => { req(entity).partitions[0].classes.push('missing'); },
    (entity) => { req(entity).partitions[0].outcome = 'failed'; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.notEqual(fingerprint(changed), fingerprint(original), mutate.toString());
  }
  for (const section of [
    '### AUTH-001 — Rule\n[[auth.a]] MUST NOT return ok.\nExplanation.',
    '### AUTH-001 — Rule\n[[auth.a]] MAY return ok.\nExplanation.',
    '### AUTH-001 — Rule\n[[auth.a]] MUST return ok.\nDifferent explanation.',
  ]) {
    assert.notEqual(fingerprint(fixture(t, '', section)), fingerprint(original));
  }
});
