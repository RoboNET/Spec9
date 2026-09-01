---
id: review-change
kind: process
context: engine
name: Review a semantic specification change
relations:
  triggered_by: engine.cli
  invokes:
    - engine.semantic-review-engine
    - engine.lint-engine
anchors:
  code:
    - plugins/spec9/tools/semantic-review.mjs#buildSemanticReview
  test:
    - plugins/spec9/tools/semantic-review.test.mjs
outcomes:
  - no domain change
  - reviewable semantic change
  - forbidden accepted-decision mutation
  - base or head cannot be loaded
requirements:
  REV-003:
    kind: operational
    subjects: [engine.review-change]
    evidence:
      code: [plugins/spec9/tools/semantic-review.mjs#buildSemanticReview]
      test: [plugins/spec9/tools/semantic-review.test.mjs#buildSemanticDiff]
  REV-004:
    kind: invariant
    subjects: [engine.review-change]
    evidence:
      test: [plugins/spec9/tools/semantic-review.test.mjs#buildChangeReport]
  REV-008:
    kind: operational
    subjects: [engine.review-change]
    evidence:
      code: [plugins/spec9/tools/slice.mjs#reviewSlice]
      test: [plugins/spec9/tools/frontmatter.test.mjs#REV-008]
  REV-009:
    kind: operational
    subjects: [engine.review-change]
    evidence:
      code: [plugins/spec9/tools/review-impact.mjs#buildReviewImpact]
      test: [plugins/spec9/tools/semantic-review.test.mjs#REV-009]
---

# Review a semantic specification change

The process loads the base and head as separate repositories, compares terms,
requirements, relations, anchors, boundaries, and decisions, then presents a
top-down impact view.

### REV-003 — Review compares meaning, not only changed files

[[engine.review-change|Semantic change review]] MUST compare the resolved head
repository against its selected Git base. [[engine.review-change|Semantic
change review]] MUST classify changes to domain nodes and requirements.

### REV-004 — Unmapped implementation files remain visible

[[engine.review-change|Semantic change review]] MUST report changed product
files that no specification anchor maps to a domain node.

### REV-008 — Human review output has an explicit size budget

[[engine.review-change|Semantic change review]] MUST apply the configured
character budget to the final combined review payload and expose truncation
instead of silently omitting detail.

### REV-009 — Review begins with product capabilities

[[engine.review-change|Semantic change review]] MUST group affected domain
handles under curated product capabilities before contexts and individual
requirements. [[engine.review-change|Semantic change review]] MUST keep stable
entrypoints, boundary handles, decision IDs, causal edges, and drill-down
commands visible on the first pass.

The main outcomes are `no domain change` and `reviewable semantic change`.
`forbidden accepted-decision mutation` is the business refusal. `base or head
cannot be loaded` is an operational refusal; timeout is not applicable because
Git snapshots are local and bounded by process execution.
