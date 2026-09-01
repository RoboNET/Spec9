---
id: product-profile
kind: contract
context: engine
name: Executable product profile
owner: Product specification maintainers
compatibility: profile keys are accepted only when an engine owner validates their behavior
anchors:
  schema:
    - spec9/profile.yaml
  test:
    - plugins/spec9/tools/profile-registry.test.mjs
requirements:
  FMT-003:
    kind: invariant
    subjects: [engine.product-profile]
    evidence:
      test: [plugins/spec9/tools/profile-registry.test.mjs#checkProfileKeyOwnership]
  FMT-004:
    kind: contract
    subjects: [engine.product-profile]
    evidence:
      schema: [spec9/profile.yaml]
      test: [plugins/spec9/tools/profile-registry.test.mjs#MANIFEST]
  FMT-005:
    kind: contract
    subjects: [engine.product-profile]
    evidence:
      code:
        - plugins/spec9/tools/openspec-coverage.mjs#configuredRoots
        - plugins/spec9/tools/git-snapshot.mjs#configuredGitRepositories
      test:
        - plugins/spec9/tools/extended-commands.test.mjs#umbrella
        - plugins/spec9/tools/semantic-review.test.mjs#REV-006
  FMT-006:
    kind: contract
    subjects: [engine.product-profile]
    evidence:
      test: [plugins/spec9/tools/candidates-cmd.test.mjs#FMT-006]
  FMT-007:
    kind: contract
    subjects: [engine.product-profile]
    evidence:
      test: [plugins/spec9/tools/extended-commands.test.mjs#FMT-007]
  FMT-008:
    kind: contract
    subjects: [engine.product-profile]
    evidence:
      schema: [spec9/profile.yaml]
      test: [plugins/spec9/tools/frontmatter.test.mjs#lifecycle]
---

# Executable product profile

## Boundary

The product profile declares contexts, legal kinds, relation endpoints,
evidence obligations, decision lifecycle, graph slices, and resource budgets.
The engine supplies mechanics and does not hardcode a product's vocabulary.

## Compatibility

A new profile key becomes supported only when the profile registry names an
implementation owner and a regression test demonstrates its effect.

## Failures

Missing sources, unknown keys, illegal relation endpoints, and promises without
an implementation owner fail validation or appear as explicit findings.

### FMT-003 — Every executable key has an owner

[[engine.product-profile|The product profile]] MUST NOT claim executable
behavior for a key that has no registered implementation owner.

### FMT-004 — Vocabulary is product-defined

[[engine.product-profile|The product profile]] MUST declare the legal contexts,
kinds, relations, and evidence rules consumed by the engine.

### FMT-005 — Umbrella repositories declare their roots

[[engine.product-profile|The product profile]] MUST allow a private umbrella
repository to declare multiple E2E registries and temporary OpenSpec migration
roots without moving code or exposing private specifications downstream.
[[engine.product-profile|The product profile]] MUST also declare each
independently versioned Git root that contributes
boundary sources or changed files to semantic review.

### FMT-006 — Code discovery has an explicit scope

[[engine.product-profile|The product profile]] MUST allow candidate discovery
to declare code roots and exclusions. [[engine.product-profile|The product
profile]] MUST NOT traverse a configured root that escapes the product root.
[[engine.product-profile|The product profile]] MUST fail validation for a
declared missing root rather than produce an empty green report.

### FMT-007 — Migration completeness has explicit levels

[[engine.product-profile|The product profile]] MUST distinguish a preserved
legacy origin from a modeled domain predicate and from a requirement verified
by exact evidence. [[engine.product-profile|The product profile]] MUST NOT
present legacy-source deletion as semantic completion.

### FMT-008 — Lifecycle meaning is explicit

[[engine.product-profile|The product profile]] MUST map the semantic
`proposed` and `accepted` lifecycle roles to product-local status names when a
decision lifecycle contains additional terminal states.
[[engine.product-profile|The product profile]] MUST NOT derive those roles from
list positions.
