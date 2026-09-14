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
  LNT-004:
    kind: operational
    subjects: [engine.lint-engine]
    evidence:
      code: [plugins/spec9/tools/delivery.mjs#buildDeliveryReport]
      test: [plugins/spec9/tools/delivery.test.mjs]
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

### LNT-004 — Delivery coverage is opt-in and edition-specific

[[engine.lint-engine|The lint engine]] MUST enable delivery checks only for
profiles declaring `delivery`. [[engine.lint-engine|The lint engine]] MUST require
current-edition coverage from a valid active or completed delivery for project
requirements linked to effectively accepted decisions, accounting for replacement
and revocation. [[engine.lint-engine|The lint engine]] MUST allow at most one active
assignment for a requirement, even when a completed delivery already covers it.
[[engine.lint-engine|The lint engine]] MUST reject malformed coverage, stale
active editions, duplicate active assignments, unknown requirements or
repositories, and missing or unsafe plan paths. Completed deliveries cover only
their recorded editions; old editions remain history without stale errors.
Cancelled deliveries do not supply coverage.
