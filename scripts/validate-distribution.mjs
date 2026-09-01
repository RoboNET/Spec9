#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const pluginRoot = path.join(root, 'plugins', 'spec9');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedVersion = packageJson.version;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const codex = readJson('plugins/spec9/.codex-plugin/plugin.json');
const claude = readJson('plugins/spec9/.claude-plugin/plugin.json');
const codexMarketplace = readJson('.agents/plugins/marketplace.json');
const claudeMarketplace = readJson('.claude-plugin/marketplace.json');
const publishWorkflowText = fs.readFileSync(path.join(root, '.github', 'workflows', 'publish-npm.yml'), 'utf8');
const publishWorkflow = parseYaml(publishWorkflowText);

for (const manifest of [codex, claude]) {
  assert(manifest.name === 'spec9', 'plugin manifest name must be spec9');
  assert(manifest.version === expectedVersion, `plugin version must match package version ${expectedVersion}`);
  assert(manifest.skills === './skills/', 'both manifests must use the shared ./skills/ directory');
  assert(manifest.license === 'MIT', 'both manifests must declare the MIT license');
}
assert(packageJson.license === 'MIT', 'package.json must declare the MIT license');
assert(packageJson.repository?.url === 'git+https://github.com/RoboNET/Spec9.git', 'package repository must match RoboNET/Spec9');
assert(packageJson.publishConfig?.access === 'public', 'npm package must publish with public access');
assert(codexMarketplace.plugins?.[0]?.source?.path === './plugins/spec9', 'Codex marketplace source must be ./plugins/spec9');
assert(claudeMarketplace.plugins?.[0]?.source === './plugins/spec9', 'Claude marketplace source must be ./plugins/spec9');
assert(publishWorkflow?.on?.release?.types?.includes('published'), 'npm publish workflow must run only after a release is published');
assert(publishWorkflow?.jobs?.publish?.permissions?.['id-token'] === 'write', 'npm publish job must request an OIDC identity token');
assert(publishWorkflow?.jobs?.publish?.permissions?.contents === 'read', 'npm publish job must keep repository access read-only');
assert(publishWorkflow?.jobs?.publish?.['timeout-minutes'] === 10, 'npm publish job must have a bounded timeout');
assert(publishWorkflowText.includes('node-version: "24"'), 'npm publish workflow must use Node.js 24');
assert(publishWorkflowText.includes('npm publish'), 'npm publish workflow must contain the publish command');
assert(!publishWorkflowText.includes('NPM_TOKEN'), 'npm publish workflow must not use a long-lived NPM_TOKEN');

const skillsRoot = path.join(pluginRoot, 'skills');
const skillNames = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert(JSON.stringify(skillNames) === JSON.stringify(['adopt', 'author', 'implement', 'review']), 'unexpected shared skill set');

for (const name of skillNames) {
  const skillPath = path.join(skillsRoot, name, 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.startsWith('---\n'), `${name}: missing YAML frontmatter`);
  assert(new RegExp(`^name: ${name}$`, 'm').test(skill), `${name}: frontmatter name must match its directory`);
  assert(/^description: .+/m.test(skill), `${name}: missing description`);
  assert(!/[А-Яа-яЁё]/u.test(skill), `${name}: reusable skill instructions must be English`);

  const uiPath = path.join(skillsRoot, name, 'agents', 'openai.yaml');
  const ui = fs.readFileSync(uiPath, 'utf8');
  assert(ui.includes(`$${name}`), `${name}: default prompt must invoke the skill by name`);
  assert(!/[А-Яа-яЁё]/u.test(ui), `${name}: Codex UI metadata must be English`);
}

for (const relativePath of [
  'README.md',
  'AGENTS.md',
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  'plugins/spec9/.codex-plugin/plugin.json',
  'plugins/spec9/.claude-plugin/plugin.json',
]) {
  const contents = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert(!/[А-Яа-яЁё]/u.test(contents), `${relativePath}: public distribution metadata must be English`);
}

process.stdout.write(`Spec9 distribution is valid: ${skillNames.length} shared skills, version ${expectedVersion}.\n`);
