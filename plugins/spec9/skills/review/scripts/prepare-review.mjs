#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function value(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] || null;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

const args = process.argv.slice(2);
const cleanup = value(args, '--cleanup');

if (cleanup) {
  const target = path.resolve(cleanup);
  const directory = fs.existsSync(path.dirname(target)) ? fs.realpathSync(path.dirname(target)) : path.dirname(target);
  const tempPrefix = path.join(fs.realpathSync(os.tmpdir()), 'spec9-review-');
  if (path.basename(target) !== 'review.md' || !directory.startsWith(tempPrefix)) {
    fail(`refusing to clean an unsafe path: ${target}`);
  } else {
    fs.rmSync(directory, { recursive: true, force: true });
  }
} else {
  const productRoot = path.resolve(value(args, '--product-root') || value(args, '--repo') || process.cwd());
  const specRoot = path.resolve(value(args, '--spec-root') || path.join(productRoot, 'spec9'));
  const base = value(args, '--base');
  const head = value(args, '--head');
  if (!base) {
    fail('provide --base <git-ref>');
  } else {
    const cli = path.resolve(value(args, '--cli') || path.join(import.meta.dirname, '..', '..', '..', 'tools', 'spec.mjs'));
    if (!fs.existsSync(cli)) {
      fail(`Spec9 review engine not found: ${cli}`);
    } else {
      const command = [cli, '--spec-root', specRoot, '--product-root', productRoot, 'review', '--base', base];
      if (head) command.push('--head', head);
      const result = spawnSync(process.execPath, command, { cwd: productRoot, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
      if (result.error) {
        fail(result.error.message);
      } else if (![0, 1].includes(result.status) || !result.stdout.trim()) {
        fail(result.stderr.trim() || `semantic review exited with code ${result.status}`);
      } else {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-review-'));
        const output = path.join(directory, 'review.md');
        fs.writeFileSync(output, result.stdout, 'utf8');
        process.stdout.write(`${output}\n`);
      }
    }
  }
}
