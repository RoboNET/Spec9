---
id: specification-repository
kind: component
context: engine
name: In-memory specification repository
relations:
  depends_on:
    - engine.document-parser
    - engine.product-profile
anchors:
  code:
    - plugins/spec9/tools/graph.mjs#loadRepo
    - plugins/spec9/tools/graph.mjs#buildGraph
  test:
    - plugins/spec9/tools/frontmatter.test.mjs
requirements:
  GRF-001:
    kind: invariant
    subjects: [engine.specification-repository]
    evidence:
      test: [scripts/engine-contract.test.mjs#GRF-001]
  GRF-002:
    kind: invariant
    subjects: [engine.specification-repository]
    evidence:
      test:
        - scripts/engine-contract.test.mjs#GRF-002
        - plugins/spec9/tools/boundary-adapters.test.mjs#REV-007
  GRF-003:
    kind: invariant
    subjects: [engine.specification-repository]
    evidence:
      test: [scripts/engine-contract.test.mjs#GRF-003]
---

# In-memory specification repository

The repository resolves qualified identities, requirement ownership, typed
relations, anchors, pattern obligations, and graph nodes from parsed pages.

### GRF-001 — Qualified identity preserves context boundaries

[[engine.specification-repository|The specification repository]] MUST resolve
an entity by the pair `context.id`. [[engine.specification-repository|The
specification repository]] MUST NOT collapse equal local IDs from different
contexts.

### GRF-002 — Anchor resolution stays inside the product root

[[engine.specification-repository|The specification repository]] MUST reject an
anchor that escapes the product root, resolves to a directory, or names a
missing whole-token symbol. [[engine.specification-repository|The specification
repository]] MUST keep both the lexical path and its resolved real path inside
the root, so an in-repository symlink cannot escape it.

### GRF-003 — Requirement identity is context-qualified

[[engine.specification-repository|The specification repository]] MUST expose a
requirement as `context.ID`. [[engine.specification-repository|The specification
repository]] MAY accept an unqualified ID only when exactly one context declares
it. [[engine.specification-repository|The specification repository]] MUST NOT
resolve an ambiguous local ID.
