---
id: validate-specification
kind: process
context: engine
name: Validate a product specification
relations:
  triggered_by: engine.cli
  invokes:
    - engine.document-parser
    - engine.specification-repository
    - engine.lint-engine
anchors:
  code:
    - plugins/spec9/tools/spec.mjs#lint
    - plugins/spec9/tools/lint.mjs#lint
  test:
    - plugins/spec9/tools/frontmatter.test.mjs
outcomes:
  - valid specification
  - structural violations found
  - specification cannot be loaded
requirements:
  ENG-003:
    kind: operational
    subjects: [engine.validate-specification]
    evidence:
      code: [plugins/spec9/tools/spec.mjs#lint]
      test: [plugins/spec9/tools/frontmatter.test.mjs#loadRepo]
  ENG-004:
    kind: invariant
    subjects: [engine.validate-specification]
    evidence:
      test: [plugins/spec9/tools/frontmatter.test.mjs#loadRepo]
---

# Validate a product specification

The CLI loads the product profile, parses declared source directories, builds
the repository graph, applies lint checks, prints all findings, and selects an
exit status.

### ENG-003 — Validation covers all declared sources

[[engine.validate-specification|Specification validation]] MUST load every
readable Markdown page under every source directory declared by the profile.

### ENG-004 — Empty validation cannot be falsely green

[[engine.validate-specification|Specification validation]] MUST fail when the
profile omits `sources` or declares no source directories.

The main outcome is `valid specification`. Business refusal is represented by
`structural violations found`. A loading failure produces `specification cannot
be loaded`; timeout is not applicable because validation performs no network,
queue, human, or external-system step.
