---
name: author
description: Author or evolve Spec9 product pages for terms, requirements, processes, policies, events, boundaries, patterns, and ADRs. Use when domain meaning must be specified in frontmatter-first Markdown; not for implementing code from an already accepted specification.
---

# Author Spec9 Pages

Produce the smallest semantic model that makes names, obligations, causality,
boundaries, decisions, and evidence navigable and checkable. The product's
`profile.yaml` is the local format contract; inspect it before creating or changing a
page.

## Decide whether an artifact is needed

Create a page only for an addressable concept that adds durable meaning or a
profile-enforced obligation.

- Use a term/entity/value page for canonical identity and definition.
- Use an operation for an action over domain state.
- Use an event for a past domain fact and a policy for the reaction that may
  issue another action. Do not model one aggregate as commanding another.
- Use a process only when causality crosses entities, a published boundary, or
  an external participant and no longer fits one aggregate-level scenario.
- Use a boundary kind for a human interface, service contract, configuration,
  or persisted format when the profile assigns that kind distinct checks.
- Use an ADR only when a meaningful alternative was rejected.
- Promote a pattern only after repeated application and at least one inherited
  obligation. Keep application flat and non-parameterized.

If none applies, extend an existing page or leave the detail in its owning code,
schema, test, or design artifact.

## Start from the profile-aware draft

```bash
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> \
  draft <kind> <context.id> --name <name>
```

The command prints a skeleton. It does not choose relations, norms, outcomes,
or a destination file. Review every field before adding it to the product.

## Write frontmatter and prose with different jobs

Put machine-checkable structure in YAML frontmatter:

- `id`, `kind`, `context`, canonical `name`, aliases, and forbidden terms;
- typed `relations` using qualified IDs;
- typed `anchors` and explicit `no_anchor` reasons;
- `requirements`, subjects, evidence, origins, decisions, and outcomes;
- partitions, combinations, pattern applications, and conformance.

Put definitions, rationale, scenarios, failure meaning, and examples in
Markdown. Use `[[context.id|inflected wording]]` for navigation, but declare
semantic graph edges in `relations`; a wiki link alone is not a relation.

For each requirement:

1. assign a stable human-chosen ID and matching Markdown heading;
2. choose the norm kind from the profile;
3. name every subject with a qualified ID and a nearby typed wiki-link;
4. write one normative thought per sentence with only `MUST`, `MUST NOT`, or
   permission-bearing `MAY`;
5. attach evidence of the required type; use a test for timing, cardinality, or
   eventual behavior;
6. declare closed domain outcomes and total partitions when the rule branches.

An anchor proves that a target still exists; it does not prove semantic
conformance. Tests are behavioral evidence. The spec owns names, definitions,
invariants, and domain relations; code owns internal fields and signatures;
OpenAPI, AsyncAPI, protobuf, DDL/migrations, configuration schemas, and design
tools own the shape of published boundaries.

## Preserve causal and decision semantics

Build causal chains from the profile's flow-bearing relations. Describe the
main result, business refusal, technical/indeterminate refusal, and timeout for
network, queue, external, or human steps. `not-applicable` requires a reason.

Never rewrite or delete an accepted ADR to change a choice. Add a new ADR with
`replaces` or `revokes`, declare broad `affects`, and connect only norms caused
by that choice through `decided_by`.

Never auto-add an outcome found in code. A mismatch requires a human decision:
change the spec, change the implementation, or classify it as non-domain.

## Check the page in context

Run the narrowest useful views while authoring, then the repository checks:

```bash
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> flow <context.id>
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> trace <requirement-id>
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> lint
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> quality --all
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> doctor --strict
```

Use `context <id> --slice review` to inspect neighborhood without reading the
entire model. Before finishing, ensure every new relation resolves, every norm
has its owning subject and evidence, every process outcome is closed, and no
specialized boundary shape was duplicated into prose.
