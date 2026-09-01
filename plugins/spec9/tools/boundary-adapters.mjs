import fs from 'node:fs';
import path from 'node:path';
import { parseYAML } from './yaml.mjs';
import { resolveExistingWithinRoot } from './safe-path.mjs';
import { escapeRegExp, splitTopLevel } from './adapters/shared.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function pointer(value, rawPointer) {
  if (!rawPointer) return value;
  const parts = String(rawPointer).replace(/^#?\//, '').split('/').filter(Boolean)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function schemaSymbol(document, symbol) {
  if (!symbol) return document;
  if (String(symbol).includes('/')) return pointer(document, symbol);
  const containers = [
    document?.components?.schemas,
    document?.components?.messages,
    document?.components?.parameters,
    document?.$defs,
    document?.definitions,
    document?.properties,
  ];
  for (const container of containers) if (container && symbol in container) return container[symbol];
  return pointer(document, symbol);
}

function parseStructured(source, extension) {
  if (extension === '.json') return JSON.parse(source);
  return parseYAML(source, 1);
}

function markdownShape(source, symbol) {
  const headings = [...source.matchAll(/^(#{1,6})\s+(.+?)\s*$/gmu)].map((match) => ({
    level: match[1].length,
    title: match[2].replace(/\s+#+\s*$/u, '').trim(),
    offset: match.index,
  }));
  if (symbol) {
    const wanted = String(symbol).replace(/^#+\s*/u, '').trim().toLocaleLowerCase('en-US');
    const index = headings.findIndex((heading) => heading.title.toLocaleLowerCase('en-US') === wanted);
    if (index === -1) return undefined;
    const heading = headings[index];
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return {
      heading: { level: heading.level, title: heading.title },
      body: normalizedType(source.slice(heading.offset, next?.offset ?? source.length)),
    };
  }
  return { headings: headings.map(({ level, title }) => ({ level, title })) };
}

function sqlShape(source, symbol) {
  const tables = {};
  const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][\w.]*)["`]?\s*\(([\s\S]*?)\)\s*;/giu;
  let match;
  while ((match = create.exec(source))) {
    const columns = {};
    for (const raw of splitTopLevel(match[2], ',')) {
      const line = raw.trim();
      if (!line || /^(?:PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/iu.test(line)) continue;
      const column = /^["`]?([A-Za-z_][\w]*)["`]?\s+([A-Za-z_][\w]*(?:\s*\([^)]*\))?(?:\[\])?)/u.exec(line);
      if (column) columns[column[1]] = { type: column[2].toUpperCase(), nullable: !/\bNOT\s+NULL\b/iu.test(line), default: /\bDEFAULT\b/iu.test(line) };
    }
    tables[match[1]] = columns;
  }
  return symbol ? tables[symbol] : tables;
}

function braceBody(source, start) {
  let depth = 1;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index++; } continue; }
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = null; continue; }
    if (char === '/' && next === '/') { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    if (char === '"' || char === '`' || (char === "'" && source[index + 2] === "'")) { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start + 1, index);
  }
  return null;
}

function normalizedType(value) {
  return String(value).replace(/\s+/gu, ' ').trim();
}

function rustNamedShape(source, symbol) {
  const name = escapeRegExp(symbol);
  const header = new RegExp(`\\b(?:pub(?:\\([^)]*\\))?\\s+)?(struct|enum)\\s+${name}\\b`, 'u').exec(source);
  if (!header) {
    const callable = new RegExp(`\\b(?:pub(?:\\([^)]*\\))?\\s+)?(?:unsafe\\s+)?fn\\s+${name}\\s*\\(([^)]*)\\)\\s*(?:->\\s*([^;{]+))?`, 'u').exec(source);
    if (callable) return { kind: 'function', parameters: normalizedType(callable[1]), returns: normalizedType(callable[2] || '()') };
    const constant = new RegExp(`\\bpub(?:\\([^)]*\\))?\\s+(const|static|type)\\s+${name}\\b([^;]*);`, 'u').exec(source);
    return constant ? { kind: constant[1], declaration: normalizedType(constant[2]) } : undefined;
  }
  const kind = header[1];
  const afterHeader = header.index + header[0].length;
  const brace = source.indexOf('{', afterHeader);
  const semicolon = source.indexOf(';', afterHeader);
  if (brace === -1 || (semicolon !== -1 && semicolon < brace)) {
    if (semicolon === -1) return undefined;
    return { kind, declaration: normalizedType(source.slice(header.index, semicolon + 1)) };
  }
  const body = braceBody(source, brace);
  if (body === null) return undefined;
  if (kind === 'struct') {
    const fields = {};
    for (const part of splitTopLevel(body, ',')) {
      const match = /^(?:#\[[\s\S]*?\]\s*)*(?:pub(?:\([^)]*\))?\s+)?([A-Za-z_][\w]*)\s*:\s*([\s\S]+)$/u.exec(part.trim());
      if (match) fields[match[1]] = normalizedType(match[2]);
    }
    return { kind, fields };
  }
  const variants = {};
  for (const part of splitTopLevel(body, ',')) {
    const match = /^(?:#\[[\s\S]*?\]\s*)*([A-Za-z_][\w]*)([\s\S]*)$/u.exec(part.trim());
    if (match) variants[match[1]] = normalizedType(match[2]) || null;
  }
  return { kind, variants };
}

function rustShape(source, symbol) {
  if (symbol) return rustNamedShape(source, symbol);
  const shapes = {};
  for (const match of source.matchAll(/\bpub(?:\([^)]*\))?\s+(?:struct|enum)\s+([A-Za-z_][\w]*)\b/gu)) {
    const shape = rustNamedShape(source, match[1]);
    if (shape) shapes[match[1]] = shape;
  }
  for (const match of source.matchAll(/\bpub(?:\([^)]*\))?\s+(?:unsafe\s+)?fn\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*(?:->\s*([^;{]+))?/gu)) {
    shapes[match[1]] = { kind: 'function', parameters: normalizedType(match[2]), returns: normalizedType(match[3] || '()') };
  }
  for (const block of source.matchAll(/\b(?:unsafe\s+)?extern\s+"([^"]+)"\s*\{/gu)) {
    const brace = source.indexOf('{', block.index + block[0].length - 1);
    const body = braceBody(source, brace);
    if (body === null) continue;
    for (const match of body.matchAll(/\bfn\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*(?:->\s*([^;]+))?;/gu)) {
      shapes[match[1]] = { kind: 'extern-function', abi: block[1], parameters: normalizedType(match[2]), returns: normalizedType(match[3] || '()') };
    }
  }
  for (const match of source.matchAll(/\bpub(?:\([^)]*\))?\s+(const|static|type)\s+([A-Za-z_][\w]*)\b([^;]*);/gu)) {
    shapes[match[2]] = { kind: match[1], declaration: normalizedType(match[3]) };
  }
  return Object.keys(shapes).length ? shapes : undefined;
}

function typescriptNamedShape(source, symbol) {
  const name = escapeRegExp(symbol);
  const header = new RegExp(`\\b(?:export\\s+)?(?:declare\\s+)?(interface|class|enum|type)\\s+${name}\\b`, 'u').exec(source);
  if (!header) return undefined;
  const kind = header[1];
  if (kind === 'type') {
    const equals = source.indexOf('=', header.index + header[0].length);
    const end = source.indexOf(';', equals);
    if (equals === -1) return undefined;
    return { kind, declaration: normalizedType(source.slice(equals + 1, end === -1 ? source.length : end)) };
  }
  const brace = source.indexOf('{', header.index + header[0].length);
  const body = brace === -1 ? null : braceBody(source, brace);
  if (body === null) return undefined;
  const members = {};
  const separator = kind === 'enum' ? ',' : ';';
  for (const part of splitTopLevel(body, separator)) {
    const match = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)([?]?)\s*([:=<(][\s\S]*)?$/u.exec(part.trim());
    if (match) members[match[1]] = { optional: match[2] === '?', declaration: normalizedType(match[3] || '') || null };
  }
  return { kind, members };
}

function typescriptShape(source, symbol) {
  if (symbol) return typescriptNamedShape(source, symbol);
  const shapes = {};
  for (const match of source.matchAll(/\bexport\s+(?:declare\s+)?(?:interface|class|enum|type)\s+([A-Za-z_$][\w$]*)\b/gu)) {
    const shape = typescriptNamedShape(source, match[1]);
    if (shape) shapes[match[1]] = shape;
  }
  return Object.keys(shapes).length ? shapes : undefined;
}

function protobufNamedShape(source, symbol) {
  const name = escapeRegExp(symbol);
  const header = new RegExp(`\\b(message|enum|service)\\s+${name}\\b`, 'u').exec(source);
  if (!header) return undefined;
  const brace = source.indexOf('{', header.index + header[0].length);
  const body = brace === -1 ? null : braceBody(source, brace);
  if (body === null) return undefined;
  if (header[1] === 'message') {
    const fields = {};
    for (const match of body.matchAll(/\b(optional|required|repeated)?\s*([.A-Za-z_][\w.]*(?:\s*<[^;>]+>)?)\s+([A-Za-z_][\w]*)\s*=\s*(\d+)\b/gu)) {
      fields[match[3]] = { label: match[1] || 'singular', type: normalizedType(match[2]), number: Number(match[4]) };
    }
    return { kind: 'message', fields };
  }
  if (header[1] === 'enum') {
    const values = {};
    for (const match of body.matchAll(/\b([A-Za-z_][\w]*)\s*=\s*(-?\d+)\b/gu)) values[match[1]] = Number(match[2]);
    return { kind: 'enum', values };
  }
  const methods = {};
  for (const match of body.matchAll(/\brpc\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s+returns\s*\(([^)]*)\)/gu)) {
    methods[match[1]] = { request: normalizedType(match[2]), response: normalizedType(match[3]) };
  }
  return { kind: 'service', methods };
}

function protobufShape(source, symbol) {
  if (symbol) return protobufNamedShape(source, symbol);
  const shapes = {};
  for (const match of source.matchAll(/\b(?:message|enum|service)\s+([A-Za-z_][\w]*)\b/gu)) {
    const shape = protobufNamedShape(source, match[1]);
    if (shape) shapes[match[1]] = shape;
  }
  return Object.keys(shapes).length ? shapes : undefined;
}

/**
 * Reads the public shape named by a schema anchor. Spec9 keeps only identity
 * and compatibility intent; the source schema remains the source of truth.
 */
export function readBoundaryShape(anchor, productRoot) {
  try {
    const resolved = resolveExistingWithinRoot(productRoot, anchor.file, { kind: 'file', label: 'schema file' });
    const source = fs.readFileSync(resolved.real, 'utf8');
    const extension = path.extname(anchor.file).toLowerCase();
    if (extension === '.sql') {
      const shape = sqlShape(source, anchor.symbol);
      return shape === undefined
        ? { status: 'unavailable', adapter: 'sql-ddl', shape: null, error: `SQL object not found: ${anchor.symbol}` }
        : { status: 'ok', adapter: 'sql-ddl', shape: canonical(shape), error: null };
    }
    const sourceAdapter = extension === '.rs' ? ['rust-source', rustShape]
      : ['.ts', '.tsx'].includes(extension) ? ['typescript-source', typescriptShape]
        : extension === '.proto' ? ['protobuf', protobufShape]
          : extension === '.md' ? ['markdown-interface', markdownShape]
          : null;
    if (sourceAdapter) {
      const shape = sourceAdapter[1](source, anchor.symbol);
      return shape === undefined
        ? { status: 'unavailable', adapter: sourceAdapter[0], shape: null, error: `schema symbol not found: ${anchor.symbol || '(public declarations)'}` }
        : { status: 'ok', adapter: sourceAdapter[0], shape: canonical(shape), error: null };
    }
    if (!['.json', '.yaml', '.yml'].includes(extension)) {
      return { status: 'unsupported', adapter: null, shape: null, error: `no boundary adapter for ${extension || 'extensionless file'}` };
    }
    const document = parseStructured(source, extension);
    const adapter = document?.openapi ? 'openapi'
      : document?.asyncapi ? 'asyncapi'
        : document?.$schema || document?.$defs || document?.definitions ? 'json-schema'
          : 'structured-config-or-design';
    const selected = schemaSymbol(document, anchor.symbol);
    if (selected === undefined) return { status: 'unavailable', adapter, shape: null, error: `schema symbol not found: ${anchor.symbol}` };
    return { status: 'ok', adapter, shape: canonical(selected), error: null };
  } catch (error) {
    return { status: 'invalid', adapter: null, shape: null, error: error.message };
  }
}

function flatten(value, prefix = '', out = new Map()) {
  if (Array.isArray(value)) {
    out.set(prefix, JSON.stringify(value));
    return out;
  }
  if (!value || typeof value !== 'object') {
    out.set(prefix, JSON.stringify(value));
    return out;
  }
  for (const key of Object.keys(value).sort()) flatten(value[key], prefix ? `${prefix}.${key}` : key, out);
  return out;
}

export function diffBoundaryShapes(before, after) {
  if (before.status !== 'ok' || after.status !== 'ok') {
    return { breaking: before.status === 'ok' && after.status !== 'ok', added: [], removed: [], changed: [], status: 'unavailable' };
  }
  const left = flatten(before.shape);
  const right = flatten(after.shape);
  const added = [...right.keys()].filter((key) => !left.has(key));
  const removed = [...left.keys()].filter((key) => !right.has(key));
  const changed = [...right.keys()].filter((key) => left.has(key) && left.get(key) !== right.get(key));
  if (before.adapter === 'sql-ddl' && after.adapter === 'sql-ddl') {
    const directColumns = Object.values(after.shape || {}).every((value) => value && typeof value === 'object' && 'type' in value);
    const beforeTables = directColumns ? { selected: before.shape || {} } : before.shape || {};
    const afterTables = directColumns ? { selected: after.shape || {} } : after.shape || {};
    const unsafeAddition = Object.entries(afterTables).some(([table, columns]) => {
      if (!(table in beforeTables) || !columns || typeof columns !== 'object') return false;
      return Object.entries(columns).some(([column, definition]) => !(column in beforeTables[table]) && definition?.nullable === false && definition?.default === false);
    });
    const unsafeChange = changed.some((key) => /(?:^|\.)(?:type|nullable)$/u.test(key))
      || changed.some((key) => /(?:^|\.)default$/u.test(key) && right.get(key) === 'false');
    return { breaking: removed.length > 0 || unsafeAddition || unsafeChange, added, removed, changed, status: 'ok' };
  }
  if (['rust-source', 'typescript-source', 'protobuf', 'markdown-interface'].includes(before.adapter) && before.adapter === after.adapter) {
    return { breaking: removed.length > 0 || changed.length > 0, added, removed, changed, status: 'ok' };
  }
  const breakingChange = changed.some((key) => /(?:^|\.)(?:type|required|enum|const|nullable)$/u.test(key));
  return { breaking: removed.length > 0 || breakingChange, added, removed, changed, status: 'ok' };
}
