import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, 'verify-release.mjs');
const packageJson = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));
const packageVersion = String(packageJson.version);
const packagePrerelease = packageVersion.split('+', 1)[0].includes('-');

function verify(tag, prerelease) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-release-test-'));
  const output = path.join(directory, 'output');
  try {
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SPEC9_RELEASE_TAG: tag,
        SPEC9_RELEASE_PRERELEASE: String(prerelease),
        GITHUB_OUTPUT: output,
      },
    });
    return {
      ...result,
      output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts the exact release tag and selects the matching dist-tag', () => {
  const result = verify(`v${packageVersion}`, packagePrerelease);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `dist-tag=${packagePrerelease ? 'next' : 'latest'}\n`);
});

test('rejects a release tag that differs from package.json', () => {
  const result = verify('v999.999.999', packagePrerelease);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must exactly match/u);
  assert.equal(result.output, '');
});

test('rejects a GitHub prerelease flag that disagrees with package.json', () => {
  const result = verify(`v${packageVersion}`, !packagePrerelease);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /prerelease=/u);
  assert.equal(result.output, '');
});
