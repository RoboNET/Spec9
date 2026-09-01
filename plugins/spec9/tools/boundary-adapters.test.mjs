import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { diffBoundaryShapes, readBoundaryShape } from './boundary-adapters.mjs';

test('REV-005 OpenAPI adapter selects a named schema and detects removed fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-boundary-'));
  try {
    const file = path.join(root, 'api.yaml');
    fs.writeFileSync(file, 'openapi: 3.1.0\ncomponents:\n  schemas:\n    User:\n      type: object\n      properties:\n        id: { type: string }\n        name: { type: string }\n');
    const before = readBoundaryShape({ file: 'api.yaml', symbol: 'User' }, root);
    fs.writeFileSync(file, 'openapi: 3.1.0\ncomponents:\n  schemas:\n    User:\n      type: object\n      properties:\n        id: { type: string }\n');
    const after = readBoundaryShape({ file: 'api.yaml', symbol: 'User' }, root);
    assert.equal(before.adapter, 'openapi');
    const diff = diffBoundaryShapes(before, after);
    assert.equal(diff.breaking, true);
    assert.deepEqual(diff.removed, ['properties.name.type']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SQL adapter compares table columns without owning the DDL', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-ddl-'));
  try {
    const file = path.join(root, 'schema.sql');
    fs.writeFileSync(file, 'CREATE TABLE sessions (id UUID NOT NULL, expires_at TIMESTAMP);\n');
    const result = readBoundaryShape({ file: 'schema.sql', symbol: 'sessions' }, root);
    assert.equal(result.status, 'ok');
    assert.equal(result.adapter, 'sql-ddl');
    assert.deepEqual(result.shape.id, { default: false, nullable: false, type: 'UUID' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REV-007 source adapters expose Rust, TypeScript, and protobuf boundary shapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-source-boundary-'));
  try {
    fs.writeFileSync(path.join(root, 'api.rs'), 'pub struct User { pub id: String, pub active: bool }\nunsafe extern "C" { fn load_user(id: *const u8) -> *mut User; }\npub fn open(id: String) -> User { todo!() }\n');
    fs.writeFileSync(path.join(root, 'api.ts'), 'export declare interface Session { id: string; expiresAt?: number; }\n');
    fs.writeFileSync(path.join(root, 'api.proto'), 'message Ticket { string id = 1; optional int64 expires_at = 2; }\n');
    assert.deepEqual(readBoundaryShape({ file: 'api.rs', symbol: 'User' }, root).shape.fields, { active: 'bool', id: 'String' });
    const rustFile = readBoundaryShape({ file: 'api.rs' }, root);
    assert.equal(rustFile.shape.load_user.kind, 'extern-function');
    assert.equal(rustFile.shape.open.returns, 'User');
    assert.equal(readBoundaryShape({ file: 'api.ts', symbol: 'Session' }, root).shape.members.expiresAt.optional, true);
    assert.equal(readBoundaryShape({ file: 'api.proto', symbol: 'Ticket' }, root).shape.fields.expires_at.number, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REV-007 SQL marks a required column without a default as breaking', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-sql-compat-'));
  try {
    const file = path.join(root, 'schema.sql');
    fs.writeFileSync(file, 'CREATE TABLE sessions (id UUID NOT NULL);\n');
    const before = readBoundaryShape({ file: 'schema.sql', symbol: 'sessions' }, root);
    fs.writeFileSync(file, 'CREATE TABLE sessions (id UUID NOT NULL, tenant_id UUID NOT NULL);\n');
    const after = readBoundaryShape({ file: 'schema.sql', symbol: 'sessions' }, root);
    assert.equal(diffBoundaryShapes(before, after).breaking, true);
    fs.writeFileSync(file, 'CREATE TABLE sessions (id UUID NOT NULL);\n');
    const wholeBefore = readBoundaryShape({ file: 'schema.sql', symbol: null }, root);
    fs.writeFileSync(file, 'CREATE TABLE sessions (id UUID NOT NULL, amount DECIMAL(10,2), tenant_id UUID NOT NULL);\n');
    const wholeAfter = readBoundaryShape({ file: 'schema.sql', symbol: null }, root);
    assert.equal(wholeAfter.shape.sessions.amount.type, 'DECIMAL(10,2)');
    assert.equal(diffBoundaryShapes(wholeBefore, wholeAfter).breaking, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REV-007 schema anchors reject symlinks that escape the product root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-safe-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'api.yaml'), 'openapi: 3.1.0\n');
    fs.symlinkSync(path.join(outside, 'api.yaml'), path.join(root, 'api.yaml'));
    const result = readBoundaryShape({ file: 'api.yaml' }, root);
    assert.equal(result.status, 'invalid');
    assert.match(result.error, /outside the configured root/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
