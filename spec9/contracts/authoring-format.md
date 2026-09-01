---
id: authoring-format
kind: contract
context: engine
name: Markdown and frontmatter authoring format
owner: Spec9 maintainers
compatibility: coordinated change across parser, documentation, fixtures, and product profiles
relations:
  references:
    - engine.ADR-001
anchors:
  schema:
    - plugins/spec9/docs/format.md
    - plugins/spec9/constitution.md
  test:
    - plugins/spec9/tools/frontmatter.test.mjs
requirements:
  FMT-001:
    kind: contract
    decided_by: [engine.ADR-001]
    subjects: [engine.authoring-format]
    evidence:
      schema: [plugins/spec9/docs/format.md]
      test: [plugins/spec9/tools/frontmatter.test.mjs#parseFrontmatter]
  FMT-002:
    kind: invariant
    decided_by: [engine.ADR-001]
    subjects: [engine.authoring-format]
    evidence:
      test: [plugins/spec9/tools/frontmatter.test.mjs#findLinks]
---

# Markdown and frontmatter authoring format

## Boundary

This contract separates human explanation in Markdown from machine-readable
identity, relations, requirements, evidence, outcomes, and decision tables in
YAML frontmatter.

## Compatibility

Format changes are coordinated changes: parser, linter, documentation, tests,
and affected product profiles move together in one Git change.

## Failures

Malformed, duplicate, absent, or unclosed frontmatter is rejected. Unknown
structured fields are surfaced through profile ownership checks instead of
being silently treated as implemented behavior.

### FMT-001 — Frontmatter is the only structured source

[[engine.authoring-format|The authoring format]] MUST store machine-readable
specification data in YAML frontmatter. [[engine.authoring-format|The authoring
format]] MUST NOT infer structured data from prose or Markdown tables.

### FMT-002 — Normative prose remains explicitly marked

[[engine.authoring-format|The authoring format]] MUST recognize only `MUST`,
`MUST NOT`, and `MAY` as normative operators outside masked Markdown zones.
