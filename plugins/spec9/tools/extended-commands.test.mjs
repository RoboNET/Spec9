import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { auditE2E, formatE2EAudit, formatE2ESuggestions } from './e2e-audit.mjs';
import { buildRustWorkspaceResolver } from './rust-workspace.mjs';
import { buildOpenSpecCoverage } from './openspec-coverage.mjs';

function write(root, relative, text) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
}

test('CLI-004 e2e audit distinguishes exact, coarse, missing, and emits suggestions', () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-e2e-'));
  write(productRoot, 'tests/e2e/cases/sample.yaml', `
suite: sample
cases:
  - { id: A, title: Exact, requirement: spec9:REX-001 }
  - { id: B, title: Coarse, requirement: spec9:RCO-001 }
  - { id: C, title: Missing, requirement: spec9:RMS-001 }
`);
  write(productRoot, 'tests/e2e/cases/missing.yaml', `
suite: missing
cases:
  - { id: D, title: Missing, requirement: spec9:RMS-001 }
`);
  const requirementsById = new Map([
    ['REX-001', { req: { evidenceAnchors: [{ type: 'test', file: 'tests/e2e/cases/sample.yaml', symbol: 'A' }] } }],
    ['RCO-001', { req: { evidenceAnchors: [{ type: 'test', file: 'tests/e2e/cases/sample.yaml', symbol: null }] } }],
    ['RMS-001', { req: { evidenceAnchors: [] } }],
  ]);
  const report = auditE2E({ productRoot, requirementsById });
  assert.deepEqual(report.counts, { exact: 1, coarse: 1, missing: 1, invalid: 1 });
  assert.equal(report.rows.find((row) => row.id === 'A').coverage, 'exact');
  assert.equal(report.rows.find((row) => row.id === 'B').coverage, 'coarse');
  assert.match(report.rows.find((row) => row.id === 'C').error, /declared RMS-001/);
  const compact = formatE2EAudit(report, { missingOnly: true });
  assert.equal((compact.match(/sample\.yaml/g) || []).length, 1);
  assert.match(compact, /B, C/);
  assert.match(formatE2ESuggestions(report), /RCO-001: test:tests\/e2e\/cases\/sample\.yaml#B/);
});

test('CLI-004 missing configured E2E roots are invalid instead of silently empty', () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-e2e-missing-'));
  const report = auditE2E({ productRoot, profile: { e2e: { roots: ['tests/missing'] } }, requirementsById: new Map() });
  assert.deepEqual(report.counts, { exact: 0, coarse: 0, missing: 0, invalid: 1 });
  assert.match(report.rows[0].error, /does not exist/);
});

test('rust workspace resolver выбирает тип по crate и module из use-path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-rust-workspace-'));
  write(root, 'crates/example_core/src/error.rs', 'pub enum TrustError { Generic }\n');
  write(root, 'crates/example_core/src/x509/error.rs', 'pub enum TrustError { Revoked, Unavailable }\n');
  const resolve = buildRustWorkspaceResolver(root);
  const result = resolve('TrustError', {
    sourceFile: 'crates/pam/src/flow.rs',
    source: 'use example_core::x509::TrustError;\n',
  });
  assert.deepEqual(result.variants, ['Revoked', 'Unavailable']);
  assert.match(result.file, /x509\/error\.rs$/);
});

test('FMT-007 OpenSpec migration reports preserved, modeled, and verified levels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-openspec-'));
  write(root, 'openspec/specs/sample/spec.md', '# Sample\n\n### Requirement: One\n\n### Requirement: Two\n');
  const requirementsById = new Map([
    ['REQ-1', { file: { path: 'one.md' }, req: { origins: ['sample::One'] } }],
    ['REQ-2', { file: { path: 'two.md' }, req: { origins: ['sample::One', 'sample::Gone'] } }],
  ]);
  const report = buildOpenSpecCoverage({ productRoot: root, requirementsById });
  assert.deepEqual(report.counts, { covered: 0, missing: 1, duplicate: 1, unknown: 1 });
  assert.deepEqual(
    { total: report.levels.total, preserved: report.levels.preserved, modeled: report.levels.modeled, verified: report.levels.verified },
    { total: 2, preserved: 2, modeled: 0, verified: 0 },
  );
});

test('umbrella profile scans nested E2E and accepted plus active OpenSpec roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-umbrella-'));
  write(root, 'core/tests/e2e/cases/sample.yaml', 'cases:\n  - { id: CORE-1, title: Core }\n');
  write(root, 'core/openspec/specs/auth/spec.md', '### Requirement: Accepted\n');
  write(root, 'enterprise/openspec/changes/server/specs/api/spec.md', '### Requirement: Planned\n');
  const profile = {
    e2e: { roots: ['core/tests/e2e/cases'] },
    legacy: {
      openspec_roots: [
        { path: 'core/openspec', include_changes: true },
        { path: 'enterprise/openspec', include_changes: true },
      ],
    },
  };
  const requirementsById = new Map([
    ['AUTH-1', { file: { path: 'auth.md' }, req: {
      origins: ['auth::Accepted'],
      evidenceAnchors: [{ type: 'test', file: 'core/tests/e2e/cases/sample.yaml', symbol: 'CORE-1' }],
    } }],
    ['SRV-1', { file: { path: 'server.md' }, req: {
      origins: ['changes/server/api::Planned'],
      evidenceAnchors: [],
    } }],
  ]);
  const repo = { productRoot: root, profile, requirementsById };
  assert.deepEqual(auditE2E(repo).counts, { exact: 1, coarse: 0, missing: 0, invalid: 0 });
  assert.deepEqual(buildOpenSpecCoverage(repo).counts, { covered: 2, missing: 0, duplicate: 0, unknown: 0 });
});
