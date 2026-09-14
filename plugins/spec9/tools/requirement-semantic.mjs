import { createHash } from 'node:crypto';
import { findOperators, maskBlockZones, maskZones, splitSentences } from './markdown.mjs';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function sortedSet(values = []) {
  return [...new Set(values.map(normalizeText))].sort();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Canonical requirement meaning, independent of source locations and evidence.
 * Array-valued metadata is a set; normative sentences and prose retain order.
 */
export function requirementSemantic(entity, req) {
  const file = entity.file;
  const start = Math.max(0, req.sectionStart - file.bodyStartLine);
  const end = Math.min(file.bodyLines.length, req.sectionEnd - file.bodyStartLine);
  const section = file.bodyLines.slice(start, end);
  const headingLines = new Set(file.headings.map((heading) => heading.line));
  // File-level sentence spans can start on the preceding section's trailing
  // newline. Analyze only this section, using the parser's masking and operators.
  const blockText = normalizeText(maskBlockZones(section)
    .filter((line, index) => !headingLines.has(file.bodyStartLine + start + index)).join('\n'));
  // Join soft line breaks before masking inline spans, which can wrap lines.
  const normativeText = normalizeText(maskZones([blockText]).join('\n'));
  const partitions = (req.partitions || []).map((partition) => ({
    outcome: normalizeText(partition.outcome),
    classes: sortedSet(partition.classes),
    total: partition.total === true,
  }));
  return {
    id: normalizeText(req.qualifiedId || `${entity.context}.${req.id}`),
    owner: normalizeText(`${entity.context}.${entity.id}`),
    kind: req.kindAttr == null ? null : normalizeText(req.kindAttr),
    title: normalizeText(req.title),
    subjects: sortedSet(req.subjects),
    outcomes: sortedSet(req.outcomes?.values),
    partitions: [...new Set(partitions.map(canonicalJson))].sort().map((partition) => JSON.parse(partition)),
    decidedBy: sortedSet(req.decidedBy),
    norms: splitSentences(normativeText)
      .map((span) => normalizeText(normativeText.slice(span.start, span.end)))
      .filter((sentence) => findOperators(sentence).length > 0),
    prose: normalizeText(section.join('\n')),
  };
}

/** Return the version-one SHA-256 fingerprint of canonical requirement meaning. */
export function requirementFingerprint(entity, req) {
  return `spec9-requirement-v1:sha256:${createHash('sha256').update(canonicalJson(requirementSemantic(entity, req)), 'utf8').digest('hex')}`;
}
