# Spec9 Constitution

## 1. One structured format

Every product page uses YAML frontmatter between `---`. Identity, relations,
anchors, requirements, outcomes, partitions, decision tables, pattern
applications, and conformance live there. Markdown contains definitions,
rationale, scenarios, and failure meaning.

Spec9 does not extract structure from prose, tables, or special inline syntax.
There is no format version field: frontmatter and its consumers change in one
commit, while Git preserves history.

## 2. Identity and links

A term is identified by `context.id`, for example `auth.credential`.
Qualification is mandatory in relations, requirement subjects, pattern
bindings, and cross-context links. The same word may have different meanings
in different bounded contexts.

A navigational Markdown link is written as
`[[auth.credential|credential presented by the user]]`. Text after `|` affects
readability only. A wiki link does not create a graph edge; semantic relations
belong in frontmatter.

## 3. Normative vocabulary

Normative prose uses only `MUST`, `MUST NOT`, and `MAY`:

- `MUST` states an obligation;
- `MUST NOT` states a prohibition;
- `MAY` grants permission to a specific subject.

Synonyms and `SHOULD` are forbidden. One normative idea occupies one sentence.
Prefer active voice. Every bearer of an obligation is listed explicitly in
`requirements.<ID>.subjects`; a pattern requirement may use the special
subject `application`.

Time limits, cardinality, and eventual behavior do not introduce a temporal
DSL. Such a requirement MUST have test evidence, and the precise executable
meaning lives in that test.

## 4. Requirements

A requirement is declared in frontmatter and has a matching Markdown heading:

```yaml
requirements:
  REV-002:
    kind: invariant
    subjects: [auth.revocation-check]
    evidence:
      test: [tests/e2e/cases/25-trust-chain.yaml]
      code: [src/trust/verifier.rs#check_revocation]
    outcomes: [valid, revoked, indeterminate]
    partitions:
      - outcome: indeterminate
        total: true
        classes: [no covering CRL, responder unavailable]
```

```markdown
### REV-002 — Indeterminate revocation rejects access
```

Requirement IDs are human-assigned and stable. Requirement kinds and their
evidence obligations come from the product profile.

When an explicit design choice creates a requirement,
`requirements.<ID>.decided_by` points to a qualified ADR ID. The ADR explains
the choice; the requirement still owns normative wording and evidence.

During OpenSpec migration, `origins` stores one-way provenance as
`capability::exact Requirement heading`. Every legacy requirement MUST have
exactly one Spec9 owner. New requirements need no origin, and OpenSpec does not
remain a second normative source.

## 5. Anchors and sources of truth

Anchors are grouped by type:

```yaml
anchors:
  code: [src/service.rs#authorize]
  type: [src/model.rs#Credential]
  test: [tests/access.yaml]
  schema: [openapi/service.yaml]
```

Anchor resolution detects a broken link; it does not prove semantic
conformance. Tests provide behavioral evidence.

Spec9 owns domain names, definitions, invariants, and relations. Code owns
internal fields, types, and signatures. Specialized boundary artifacts own
published shape: OpenAPI, AsyncAPI, protobuf, JSON Schema, DDL/migrations,
configuration schemas, design systems, and mockups. Spec9 links those artifacts
to domain meaning without copying their structure.

## 6. Relations and boundaries

All graph edges live under `relations`. Their closed vocabulary is declared in
`profile.yaml -> relation_types`, including cardinality, allowed source and
target kinds, and optional causal flow direction. `references` is an escape
hatch for navigation with no more precise role; it MUST NOT form the causal
backbone of a process.

A kind exists only when it adds a checkable obligation. A product profile may,
for example, distinguish:

- an interface, which owns actions, states, feedback, and accessibility;
- a contract, which owns parties, meaning, compatibility, and failures;
- configuration, which owns its operator, source, and application time;
- persistence, which owns format evolution, atomicity, and corruption policy.

UI shape remains in the design tool. Spec9 anchors the design and describes
states, behavior, and accessibility normatively.

## 7. Processes

Create a process only when causality crosses multiple entities, a published
boundary, or an external participant. A process connects already defined nodes
and declares a closed set of outcomes. Network, queue, external, and human
steps describe the main outcome, business refusal, and timeout; a
`not-applicable` claim requires a reason.

One aggregate does not command another directly. Cross-aggregate transitions
belong to a policy or orchestrator and a published contract.

Causal views follow `relation_types.*.flow`, not numbered prose. Prose explains
branches and failures; graph edges state which fact triggers a policy, which
operation it issues, and through which boundary the action reaches state.

A process without a causal input or output may remain a draft, but lint warns
until the author connects it or decides a separate process page is unnecessary.

## 8. Patterns and decisions

A pattern is a flat package of obligations with exemplar and optional
counterexample anchors. Patterns do not inherit other patterns and accept no
literal parameters.

```yaml
applies:
  - pattern: fail-closed
    bindings:
      indeterminate: auth.ADR-002
conformance:
  fail-closed/FC-001:
    test: [tests/e2e/cases/25-trust-chain.yaml]
```

Patterns have no format-level version. Git preserves history. An incompatible
obligation change requires an explicit decision and migration of applications
in the same change.

An ADR deserves a page only when a meaningful alternative was rejected.
Accepted decisions are append-only semantic history. A new choice creates a new
ADR with `relations.replaces`; removing a policy without replacement creates a
new ADR with `relations.revokes`. The replacement graph MUST remain acyclic.

`relations.affects` declares broad blast radius. A requirement's `decided_by`
declares precise origin. Neither replaces the other.

## 9. Outcomes and combinations

`outcomes` is a closed set of domain results. Spec9 MUST NOT automatically add
an outcome found in code. A person decides whether to change the spec, change
the implementation, or classify the result as non-domain.

`partitions` split an outcome into total equivalence classes. `combinations`
stores decision-table dimensions and rows in frontmatter. Lint checks totality
and disjointness. `outcome: null` records a known gap and remains a warning
until a decision is made.

## 10. Changes

Spec9 has no parallel delta tree. Git is the append-only journal. A
machine-checkable `Domain impact` section in a commit or merge request names
affected qualified IDs, requirements, relations, decisions, and boundaries.

`spec9 change` derives a proposed section and required checks from changed
files. It is a view of the diff, not another normative artifact.

`spec9 review --base <ref>` builds both semantic states from Git and compares
terms, requirements, relations, anchors, boundaries, and ADRs. An accepted ADR
MUST NOT be modified or removed relative to the base; create a replacing or
revoking ADR instead. Temporary Git snapshots are deleted after the command.

Syntax validity and semantic sufficiency remain separate. `lint` blocks format
contract violations. `quality` reports possible false-green signals that need
human judgment. `next` prioritizes lint, quality, trace, outcomes, E2E, and
migration coverage without creating a separate backlog file.
