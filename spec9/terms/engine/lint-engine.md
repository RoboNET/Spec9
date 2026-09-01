---
id: lint-engine
kind: component
context: engine
name: Structural lint engine
relations:
  depends_on:
    - engine.specification-repository
    - engine.product-profile
anchors:
  code:
    - plugins/spec9/tools/lint.mjs#lint
  test:
    - plugins/spec9/tools/frontmatter.test.mjs
requirements:
  LNT-001:
    kind: invariant
    subjects: [engine.lint-engine]
    evidence:
      test: [plugins/spec9/tools/frontmatter.test.mjs#lint]
  LNT-002:
    kind: operational
    subjects: [engine.lint-engine]
    evidence:
      code: [plugins/spec9/tools/lint.mjs#lint]
  LNT-003:
    kind: invariant
    subjects: [engine.lint-engine]
    evidence:
      test: [plugins/spec9/tools/quality.test.mjs#LNT-003]
---

# Structural lint engine

The lint engine applies profile-owned checks to the complete repository and
returns stable finding codes with source locations.

### LNT-001 — Errors make validation fail

[[engine.lint-engine|The lint engine]] MUST classify contract violations as
errors that produce a failing CLI exit status.

### LNT-002 — Known semantic uncertainty remains visible

[[engine.lint-engine|The lint engine]] MUST report an explicitly undefined
decision-table row as a warning. [[engine.lint-engine|The lint engine]] MUST NOT
invent an outcome for that row.

### LNT-003 — Decisions do not become requirement containers

[[engine.lint-engine|The lint engine]] MUST surface an ADR that contains
requirements. [[engine.lint-engine|The lint engine]] MUST assign higher severity
when a requirement names only the ADR itself as its subject. Domain deltas belong on affected domain pages;
the ADR remains linked through `decided_by`.
