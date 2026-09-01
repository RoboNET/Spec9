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
