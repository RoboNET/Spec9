import fs from 'node:fs';
import path from 'node:path';

function escapes(relative) {
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

/**
 * Resolves an existing path below a trusted root and verifies the real path as
 * well as the lexical path. This rejects a symlink inside the repository that
 * points outside it.
 */
export function resolveExistingWithinRoot(root, candidate, { kind = null, label = 'path', allowRoot = false } = {}) {
  const rootAbsolute = path.resolve(root);
  const value = String(candidate || '');
  if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a non-empty relative path: ${JSON.stringify(value)}`);

  const lexical = path.resolve(rootAbsolute, value);
  const lexicalRelative = path.relative(rootAbsolute, lexical);
  if (escapes(lexicalRelative) || (!allowRoot && lexicalRelative === '')) {
    throw new Error(`${label} escapes the configured root: ${value}`);
  }
  if (!fs.existsSync(lexical)) throw new Error(`${label} does not exist: ${value}`);

  const rootReal = fs.realpathSync(rootAbsolute);
  const real = fs.realpathSync(lexical);
  const realRelative = path.relative(rootReal, real);
  if (escapes(realRelative) || (!allowRoot && realRelative === '')) {
    throw new Error(`${label} resolves outside the configured root: ${value}`);
  }

  const stat = fs.statSync(real);
  if (kind === 'file' && !stat.isFile()) throw new Error(`${label} is not a file: ${value}`);
  if (kind === 'directory' && !stat.isDirectory()) throw new Error(`${label} is not a directory: ${value}`);
  return { absolute: lexical, real, relative: lexicalRelative.split(path.sep).join('/') };
}

export function isPathInside(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !escapes(relative) && (allowRoot || relative !== '');
}
