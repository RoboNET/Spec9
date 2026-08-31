#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

for (const manifest of [codex, claude]) {
  assert(manifest.name === 'spec9', 'plugin manifest name must be spec9');
  assert(manifest.version === expectedVersion, `plugin version must match package version ${expectedVersion}`);
  assert(manifest.skills === './skills/', 'both manifests must use the shared ./skills/ directory');
  assert(manifest.license === 'MIT', 'both manifests must declare the MIT license');
}
assert(packageJson.license === 'MIT', 'package.json must declare the MIT license');
assert(codexMarketplace.plugins?.[0]?.source?.path === './plugins/spec9', 'Codex marketplace source must be ./plugins/spec9');
assert(claudeMarketplace.plugins?.[0]?.source === './plugins/spec9', 'Claude marketplace source must be ./plugins/spec9');

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
