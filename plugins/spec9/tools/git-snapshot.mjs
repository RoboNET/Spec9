import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadRepo } from './graph.mjs';
import { resolveExistingWithinRoot } from './safe-path.mjs';

function git(productRoot, args, options = {}) {
  return execFileSync('git', args, { cwd: productRoot, ...options });
}

function validateRef(ref) {
  const value = String(ref || '');
  if (!value || value.startsWith('-') || /[\0\r\n]/u.test(value)) throw new Error(`invalid Git ref: ${JSON.stringify(value)}`);
  return value;
}

export function changedFilesBetween(productRoot, base, head = null) {
  base = validateRef(base);
  if (head) head = validateRef(head);
  const args = head ? ['diff', '--name-only', base, head] : ['diff', '--name-only', base];
  const tracked = git(productRoot, args, { encoding: 'utf8' }).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (head) return [...new Set(tracked)].sort();
  const untracked = git(productRoot, ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

export function configuredGitRepositories(productRoot, profile = {}) {
  const configured = profile.repositories;
  const entries = Array.isArray(configured) && configured.length
    ? configured
    : [{ id: 'product', path: '.' }];
  const ids = new Set();
  const repositories = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || typeof entry.path !== 'string') {
      throw new Error('each repositories entry must contain string id and path fields');
    }
    if (!/^[a-z][a-z0-9_-]*$/u.test(entry.id) || ids.has(entry.id)) throw new Error(`invalid or duplicate repository id: ${entry.id}`);
    ids.add(entry.id);
    const resolved = resolveExistingWithinRoot(productRoot, entry.path, { kind: 'directory', label: `repository ${entry.id}`, allowRoot: true });
    const gitRoot = fs.realpathSync(git(resolved.real, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
    if (gitRoot !== resolved.real) throw new Error(`repository ${entry.id} path must name its Git root: ${entry.path}`);
    const prefix = path.relative(path.resolve(productRoot), resolved.absolute).split(path.sep).join('/');
    repositories.push({ id: entry.id, path: entry.path, root: resolved.real, prefix: prefix === '.' ? '' : prefix });
  }
  return repositories;
}

function prefixed(prefix, file) {
  return prefix ? `${prefix}/${file}` : file;
}

export function changedFilesBetweenRepositories(productRoot, profile, base, head = null) {
  const files = [];
  for (const repository of configuredGitRepositories(productRoot, profile)) {
    for (const file of changedFilesBetween(repository.root, base, head)) files.push(prefixed(repository.prefix, file));
  }
  return [...new Set(files)].sort();
}

/** Материализует каталог спецификации из Git-ref без checkout и изменения worktree. */
export function loadRepoAtGitRef(productRoot, specRoot, ref) {
  ref = validateRef(ref);
  productRoot = path.resolve(productRoot);
  specRoot = path.resolve(specRoot);
  const specPath = path.relative(productRoot, specRoot).replace(/\\/g, '/');
  if (!specPath || specPath === '.' || specPath.startsWith('../') || path.isAbsolute(specPath)) {
    throw new Error(`specification root must be inside the product root: ${specRoot}`);
  }
  const commit = git(productRoot, ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  try {
    git(productRoot, ['cat-file', '-e', `${commit}:${specPath}/profile.yaml`]);
  } catch {
    throw new Error(`Git ref ${ref} (${commit.slice(0, 12)}) does not contain ${specPath}/profile.yaml`);
  }

  const tempProductRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec9-ref-'));
  try {
    const archive = git(productRoot, ['archive', '--format=tar', commit, specPath], { maxBuffer: 100 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-', '-C', tempProductRoot], { input: archive, maxBuffer: 100 * 1024 * 1024 });
    let repo = loadRepo(path.join(tempProductRoot, specPath), tempProductRoot);
    const repositories = configuredGitRepositories(productRoot, repo.profile);
    const commits = new Map([[repositories.find((item) => item.prefix === '')?.id || 'product', commit]]);
    const schemaFiles = [...new Set(repo.files.flatMap((file) => [
      ...file.frontmatterAnchors,
      ...file.requirements.flatMap((req) => req.evidenceAnchors),
    ]).filter((anchor) => anchor.type === 'schema').map((anchor) => path.posix.normalize(anchor.file)))];
    const grouped = new Map();
    for (const file of schemaFiles) {
      if (file === '..' || file.startsWith('../') || path.posix.isAbsolute(file) || file.startsWith(`${specPath}/`)) continue;
      const repository = [...repositories]
        .sort((a, b) => b.prefix.length - a.prefix.length)
        .find((item) => !item.prefix || file === item.prefix || file.startsWith(`${item.prefix}/`));
      if (!repository) continue;
      const internal = repository.prefix ? file.slice(repository.prefix.length + 1) : file;
      let repositoryCommit = commits.get(repository.id);
      if (!repositoryCommit) {
        repositoryCommit = git(repository.root, ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
        commits.set(repository.id, repositoryCommit);
      }
      try {
        git(repository.root, ['cat-file', '-e', `${repositoryCommit}:${internal}`]);
      } catch {
        continue;
      }
      if (!grouped.has(repository.id)) grouped.set(repository.id, { repository, commit: repositoryCommit, files: [] });
      grouped.get(repository.id).files.push(internal);
    }
    for (const { repository, commit: repositoryCommit, files } of grouped.values()) {
      const schemaArchive = git(repository.root, ['archive', '--format=tar', repositoryCommit, ...files], { maxBuffer: 100 * 1024 * 1024 });
      const destination = path.join(tempProductRoot, repository.prefix);
      fs.mkdirSync(destination, { recursive: true });
      execFileSync('tar', ['-xf', '-', '-C', destination], { input: schemaArchive, maxBuffer: 100 * 1024 * 1024 });
    }
    if (grouped.size) {
      repo = loadRepo(path.join(tempProductRoot, specPath), tempProductRoot);
    }
    return {
      ref,
      commit,
      commits: Object.fromEntries(commits),
      repo,
      cleanup: () => fs.rmSync(tempProductRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(tempProductRoot, { recursive: true, force: true });
    throw error;
  }
}
