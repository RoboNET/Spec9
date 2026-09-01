---
id: semantic-review-engine
kind: component
context: engine
name: Semantic review engine
relations:
  depends_on: [engine.specification-repository]
  references: [engine.ADR-002]
anchors:
  code:
    - plugins/spec9/tools/semantic-review.mjs#buildSemanticReview
    - plugins/spec9/tools/git-snapshot.mjs#loadRepoAtGitRef
  test:
    - plugins/spec9/tools/semantic-review.test.mjs
requirements:
  REV-001:
    kind: invariant
    decided_by: [engine.ADR-002]
    subjects: [engine.semantic-review-engine]
    evidence:
      test: [plugins/spec9/tools/semantic-review.test.mjs#accepted]
  REV-002:
    kind: invariant
    decided_by: [engine.ADR-002]
    subjects: [engine.semantic-review-engine]
    evidence:
      test: [plugins/spec9/tools/semantic-review.test.mjs#loadRepoAtGitRef]
  REV-005:
    kind: invariant
    subjects: [engine.semantic-review-engine]
    evidence:
      code: [plugins/spec9/tools/boundary-adapters.mjs#readBoundaryShape]
      test: [plugins/spec9/tools/boundary-adapters.test.mjs#REV-005]
  REV-006:
    kind: invariant
    decided_by: [engine.ADR-002]
    subjects: [engine.semantic-review-engine]
    evidence:
      code: [plugins/spec9/tools/git-snapshot.mjs#changedFilesBetweenRepositories]
      test: [plugins/spec9/tools/semantic-review.test.mjs#REV-006]
  REV-007:
    kind: invariant
    subjects: [engine.semantic-review-engine]
    evidence:
      code: [plugins/spec9/tools/boundary-adapters.mjs#readBoundaryShape]
      test: [plugins/spec9/tools/boundary-adapters.test.mjs#REV-007]
---

# Semantic review engine

The review engine materializes base and head specifications, compares their
meaning, and maps changed code and boundary files back to affected domain nodes.

### REV-001 — Accepted decisions are append-only

[[engine.semantic-review-engine|The semantic review engine]] MUST reject direct
modification or deletion of an accepted ADR relative to the selected Git base.

### REV-002 — Temporary snapshots do not mutate the worktree

[[engine.semantic-review-engine|The semantic review engine]] MUST materialize
Git snapshots without checkout. [[engine.semantic-review-engine|The semantic
review engine]] MUST remove their temporary directories.

### REV-005 — Boundary review reads authoritative schemas

[[engine.semantic-review-engine|The semantic review engine]] MUST read supported
OpenAPI, AsyncAPI, JSON Schema, protobuf, DDL, Rust/TypeScript source,
configuration, and design artifacts through
adapters and classify their public-shape delta. [[engine.semantic-review-engine|The
semantic review engine]] MUST NOT copy fields or signatures into Spec9 as a
second source of truth.

### REV-006 — Umbrella review includes every declared Git repository

[[engine.semantic-review-engine|The semantic review engine]] MUST load boundary
sources and changed paths from every repository declared by the product
profile. [[engine.semantic-review-engine|The semantic review engine]] MUST
preserve product-root-relative paths when combining independently versioned
repositories.

### REV-007 — Boundary adapters fail closed and classify compatibility

[[engine.semantic-review-engine|The semantic review engine]] MUST reject
unsupported, missing, imprecise, or root-escaping boundary sources.
[[engine.semantic-review-engine|The semantic review engine]] MUST classify
removals and incompatible source-shape changes, including a required SQL column
added without a default, as breaking.
