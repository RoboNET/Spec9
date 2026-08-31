import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadRepo } from './graph.mjs';
import { loadRepoAtGitRef, changedFilesBetween } from './git-snapshot.mjs';
import { buildSemanticDiff, formatSemanticReview } from './semantic-review.mjs';
import { buildChangeReport, formatChangeReport } from './change.mjs';

const PROFILE = `
profile: semantic-test
sources: [terms, decisions, contracts]
relation_types:
  references: { cardinality: many }
contexts:
  auth: { title: Auth, prefix: [AUTH] }
kinds:
  сущность: { title: Entity, anchors: { required: [], optional: [code] } }
  операция: { title: Operation, anchors: { required: [], optional: [code, test] } }
  контракт: { title: Contract, review_role: boundary, anchors: { required: [], optional: [schema] } }
  решение: { title: Decision, append_only: true, lifecycle: [предложено, принято], anchors: { required: [] } }
norm_kinds:
  инвариант: { evidence: [] }
`;

function write(root, relative, text) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
}

function page({ id, kind = 'сущность', relation = null, requirement = '', body = '', extra = '' }) {
  return `---\nid: ${id}\nkind: ${kind}\ncontext: auth\nname: ${id}\n${relation ? `relations: { references: [${relation}] }\n` : ''}${extra}${requirement}---\n# ${id}\n${body}\n`;
}

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-semantic-'));
  write(root, 'profile.yaml', PROFILE);
  for (const [relative, text] of Object.entries(files)) write(root, relative, text);
  return loadRepo(root, root);
}

test('semantic diff classifies domain changes and protects an accepted ADR', () => {
  const requirementBefore = 'requirements:\n  AUTH-001:\n    kind: инвариант\n    subjects: [auth.a]\n    outcomes: [ok]\n';
  const requirementAfter = 'requirements:\n  AUTH-001:\n    kind: инвариант\n    subjects: [auth.a]\n    outcomes: [ok, denied]\n';
  const adrExtra = 'status: принято\ndate: 2026-01-01\n';
  const base = repo({
    'terms/a.md': page({ id: 'a', kind: 'операция', relation: 'auth.b', requirement: requirementBefore, body: '### AUTH-001 — Rule\n[[auth.a]] MUST return ok.' }),
    'terms/b.md': page({ id: 'b' }),
    'contracts/api.md': page({ id: 'api', kind: 'контракт' }),
    'decisions/adr.md': page({ id: 'ADR-001', kind: 'решение', extra: adrExtra, body: '## Решение\nСтарое.' }),
  });
  const head = repo({
    'terms/a.md': page({ id: 'a', kind: 'операция', relation: 'auth.c', requirement: requirementAfter, body: '### AUTH-001 — Rule\n[[auth.a]] MUST return ok or denied.' }),
    'terms/c.md': page({ id: 'c' }),
    'decisions/adr.md': page({ id: 'ADR-001', kind: 'решение', extra: adrExtra, body: '## Решение\nПереписано.' }),
  });
  const diff = buildSemanticDiff(base, head, { base: 'before', head: 'after' });
  assert.deepEqual(diff.counts.terms, { added: 1, modified: 1, removed: 2 });
  assert.equal(diff.counts.requirements.modified, 1);
  assert.deepEqual(diff.counts.relations, { added: 1, removed: 1 });
  assert.ok(diff.decisions.some((item) => item.code === 'ADR-ACCEPTED-MODIFIED'));
  assert.ok(diff.boundaries.terms.some((item) => item.change === 'removed' && item.term.id === 'auth.api'));
  assert.equal(diff.risk, 'high');

  const formatted = formatSemanticReview({ semantic: diff, impact: { contexts: [], unmappedFiles: [] } });
  assert.match(formatted, /## Boundaries/);
  assert.match(formatted, /## Decisions/);
  assert.match(formatted, /auth\.a -\[references\]-> auth\.c/);
  assert.match(formatted, /spec\.mjs context AUTH-001 --slice review/);

  const change = formatChangeReport(buildChangeReport(head, ['spec9/terms/a.md'], { semanticDiff: diff }));
  assert.match(change, /added: auth\.a -\[references\]-> auth\.c/);
  assert.match(change, /removed: auth\.a -\[references\]-> auth\.b/);
});

test('Git snapshot загружает указанный каталог спецификации без checkout', () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-git-snapshot-'));
  const specRoot = path.join(productRoot, 'domain-spec');
  write(specRoot, 'profile.yaml', PROFILE);
  write(specRoot, 'terms/a.md', page({ id: 'a' }));
  execFileSync('git', ['init', '-b', 'main'], { cwd: productRoot });
  execFileSync('git', ['add', '.'], { cwd: productRoot });
  execFileSync('git', ['-c', 'user.name=Spec9', '-c', 'user.email=spec9@example.invalid', 'commit', '-m', 'baseline'], { cwd: productRoot });
  const snapshot = loadRepoAtGitRef(productRoot, specRoot, 'HEAD');
  try {
    assert.equal(snapshot.repo.entities.length, 1);
    assert.equal(snapshot.repo.profile.profile, 'semantic-test');
  } finally {
    snapshot.cleanup();
  }
});

test('Git-ref не может подменить опцию команды', () => {
  const specRoot = path.resolve(import.meta.dirname, '..');
  assert.throws(() => changedFilesBetween(path.dirname(specRoot), '--help'), /недопустимый Git-ref/);
});
