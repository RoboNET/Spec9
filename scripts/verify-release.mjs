#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version ?? '');
const releaseTag = String(process.env.SPEC9_RELEASE_TAG ?? '');
const releasePrerelease = String(process.env.SPEC9_RELEASE_PRERELEASE ?? '') === 'true';

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
if (!semverPattern.test(version)) {
  throw new Error(`package.json version is not a supported SemVer value: ${JSON.stringify(version)}`);
}

const expectedTag = `v${version}`;
if (releaseTag !== expectedTag) {
  throw new Error(`release tag ${JSON.stringify(releaseTag)} must exactly match ${JSON.stringify(expectedTag)}`);
}

const versionWithoutBuild = version.split('+', 1)[0];
const versionPrerelease = versionWithoutBuild.includes('-');
if (releasePrerelease !== versionPrerelease) {
  throw new Error(
    `GitHub release prerelease=${releasePrerelease} does not match package version ${JSON.stringify(version)}`,
  );
}

const distTag = versionPrerelease ? 'next' : 'latest';
const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) fs.appendFileSync(outputPath, `dist-tag=${distTag}\n`, 'utf8');

process.stdout.write(`Release ${releaseTag} is valid and will publish with npm dist-tag ${distTag}.\n`);
