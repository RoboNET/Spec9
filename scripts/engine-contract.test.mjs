import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

import { loadRepo, resolveAnchor } from '../plugins/spec9/tools/graph.mjs';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'plugins', 'spec9', 'tools', 'spec.mjs');

test('CLI-001 discovers the product-local self specification', () => {
  const result = spawnSync(process.execPath, [cli, 'lint'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('CLI-002 tolerates a downstream reader closing stdout', async () => {
  const child = spawn(process.execPath, [cli, 'trace'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.once('data', () => child.stdout.destroy());
  const [code] = await once(child, 'close');
  assert.equal(code, 0, stderr);
});

test('GRF-001 keeps equal local IDs separate by context', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-identity-'));
  try {
    fs.mkdirSync(path.join(directory, 'terms'));
    fs.writeFileSync(path.join(directory, 'profile.yaml'), `
profile: identity-test
sources: [terms]
relation_types: { references: { cardinality: many } }
contexts:
  one: { title: One, prefix: [ONE] }
  two: { title: Two, prefix: [TWO] }
kinds:
  component: { title: Component, anchors: { required: [] } }
norm_kinds: {}
`);
    fs.writeFileSync(path.join(directory, 'terms', 'one.md'), '---\nid: shared\nkind: component\ncontext: one\nname: One\n---\n# One\n');
    fs.writeFileSync(path.join(directory, 'terms', 'two.md'), '---\nid: shared\nkind: component\ncontext: two\nname: Two\n---\n# Two\n');
    const repository = loadRepo(directory, directory);
    assert.equal(repository.entitiesByContextId.get('one shared')?.name, 'One');
    assert.equal(repository.entitiesByContextId.get('two shared')?.name, 'Two');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('GRF-002 rejects unsafe or imprecise anchors', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-anchor-'));
  try {
    fs.writeFileSync(path.join(directory, 'source.mjs'), 'const targetSymbol = true;\n');
    assert.equal(resolveAnchor({ file: '../outside', symbol: null }, directory).ok, false);
    assert.equal(resolveAnchor({ file: 'source.mjs', symbol: 'target' }, directory).ok, false);
    assert.equal(resolveAnchor({ file: 'source.mjs', symbol: 'targetSymbol' }, directory).ok, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
