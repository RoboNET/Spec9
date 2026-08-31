---
name: adopt
description: Adopt Spec9 in a product repository or evolve its profile of contexts, artifact kinds, relations, anchors, and review slices. Use for initial setup, migration from prose/OpenSpec, or profile design; not for authoring one ordinary domain page.
---

# Adopt Spec9

Set up a product-owned semantic specification backed by the external Spec9
engine. Keep the engine and product model separate: the engine owns the format contract,
checks, graph operations, and review views; the product owns `profile.yaml` and
its domain pages.

## Discover the roots

Resolve and keep two explicit paths:

- `product-root`: the repository containing code, tests, schemas, and designs;
- `spec-root`: the product's specification directory, normally
  `<product-root>/spec9`.

If `profile.yaml` already exists, inspect it before proposing any structure.
Also inspect the product's build manifests, major boundaries, and existing
normative documentation. Do not copy Spec9's `tools/`, `docs/`,
`constitution.md`, or skills into the product repository.

Use `npx --yes spec9@0.1.0` by default. During local engine development, a
product may depend on the engine through a package-manager file dependency; do
not hardcode a machine-specific path into reusable product configuration.

## Design the profile

Start from the product's language and verification needs, not from a universal
DDD taxonomy.

1. Declare bounded contexts with qualified identity `context.id`.
2. Add a `kind` only when it carries a check not already expressed by another
   kind. Define its required anchors, fields, sections, and legal links.
3. Declare precise `relation_types` with source kinds, target kinds,
   cardinality, and `flow` direction for causal edges. Keep `references` as a
   navigation escape hatch, never as the causal backbone.
4. Declare source directories explicitly. Files outside them are not product
   pages.
5. Define norm kinds and evidence expectations. A behavioral obligation should
   normally have test evidence.
6. Add graph slices and budgets only when the product needs different traversal
   behavior. Unknown profile keys are errors, so do not invent configuration
   that the engine does not consume.

Read `<spec9-plugin>/docs/format.md` for supported frontmatter and
`<spec9-plugin>/constitution.md` for source-of-truth rules when profile choices
are unclear.

## Bootstrap a vertical slice

Do not attempt to catalogue the whole codebase first. Select one valuable flow
that crosses a meaningful boundary and model enough of it to prove the profile:

- its canonical terms and actors;
- one operation or process;
- its closed domain outcomes;
- one behavioral norm with evidence;
- any published contract, configuration, persistence, or interface boundary;
- an ADR only if a real alternative was rejected.

Generate profile-aware page skeletons without writing them automatically:

```bash
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> \
  draft <kind> <context.id> --name <name>
```

Place reviewed output in a directory listed by `sources`. Link to code, tests,
schemas, and designs with typed anchors; do not copy their internal structures
into Markdown.

## Validate adoption

Run, in this order:

```bash
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> lint
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> graph
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> doctor --strict
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> quality --all
```

Treat `lint` failures as contract violations. Treat `quality` findings as
review signals, not proven defects. If migrating OpenSpec, use `origins` as
one-way provenance and `coverage --missing` to prove every legacy requirement
has exactly one Spec9 owner; do not preserve two normative sources.

Finish by documenting the product-local commands and the resolved source-of-
truth boundaries. Do not create a parallel change log: Git owns history.
