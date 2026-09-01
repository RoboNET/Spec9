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
