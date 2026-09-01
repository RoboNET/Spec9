---
name: implement
description: Implement or reconcile a product change governed by Spec9, using semantic slices, requirements, evidence, outcomes, and Domain impact. Use for feature work, bug fixes, and spec-code divergence; not for a review-only request.
---

# Implement with Spec9

Use Spec9 as a semantic index for the change, not as a code generator. Keep the
spec, code, tests, specialized boundary schemas, and Git history in their
respective ownership roles.

## Establish the change contract

Resolve `product-root`, `spec-root`, and the Git base. Inspect the worktree so
unrelated user changes remain untouched. Identify the requested semantic
handles: qualified term IDs, qualified requirement IDs, ADR IDs, boundary pages, or code
symbols.

If the profile declares `repositories`, inspect each exact Git root named by
the change. Spec9 combines their paths under `product-root`, but the chosen
base/head ref must resolve in every repository that supplies an affected
boundary. Do not reduce a multi-repository product to the specification
repository's diff.

If the request begins from a requirement or term, load an implementation slice:

```bash
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> \
  context <context.REQ-ID-or-context.id> --slice implement
```

Use focused queries rather than reading the entire specification:

- `trace <context.REQ-ID>` for subject, evidence, implementation, and outcomes;
- `flow <context.id>` for causal neighbors;
- `decision <context.ADR-id>` for current decision state and impact;
- `why <path>#<symbol>` when code is the starting point;
- `next` when the user asks which semantic gap to address next.

## Classify before editing

Choose one of three cases from evidence:

1. **Implementation divergence:** the accepted norm is correct; change code and
   tests, preserving the norm.
2. **Domain change:** names, behavior, outcomes, causality, or a published
   boundary changed; update the owning pages and evidence in the same change.
   Add an ADR only for a real choice with a rejected alternative.
3. **No semantic impact:** internal fields, signatures, refactoring, or
   implementation detail changed without changing domain meaning; do not invent
   a spec delta.

When a specialized boundary changes, update its owning artifact first or in the
same change: OpenAPI/AsyncAPI/protobuf for service contracts, DDL/migrations for
persistence, a configuration schema for configuration, and a design system or
mockup for UI form. Rust or TypeScript may own the published shape when there is
no separate IDL. Spec9 describes the meaning, compatibility rule, failures,
and anchors that artifact without copying its structure. Treat a boundary
adapter failure as a broken contract, not as an unavailable optional check.

## Implement and connect evidence

Implement the smallest cohesive change. Preserve stable domain names in code
where practical, but synchronize only names and behavioral invariants with
Spec9—not internal fields, types, or signatures.

Update typed anchors when symbols move. Add or update tests that demonstrate
the affected requirement and its declared outcomes. An existing symbol anchor
is only a live link; do not treat it as proof that behavior conforms.

For an accepted ADR, never edit history to express a new choice. Add a replacing
or revoking ADR and migrate affected norms and implementation explicitly.

## Verify semantic closure

Run product tests plus checks proportional to the change. The full semantic
closure is:

```bash
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> lint
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> trace <context.REQ-ID>
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> e2e --strict
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> doctor --strict
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> quality --all
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> review --base <ref> --strict
npx --yes spec9@0.1.0 --spec-root <spec-root> --product-root <product-root> change --base <ref>
```

When the affected requirement declares domain outcomes and resolves to a
`code:` anchor, also run `outcomes <context.REQ-ID>`. A requirement backed only
by a schema or test has no code outcome surface to compare; record that as not
applicable instead of treating a deliberately impossible comparison as green.
Do not use or invent `outcomes --fix`; outcome mismatches require judgment.
Separate pre-existing warnings from regressions introduced by the change.

The `change` output is the proposed machine-checkable `Domain impact` section
for the commit or MR. Include it in the durable Git/MR description as required
by the product workflow, but never save it as a parallel delta tree under the
specification.

Finish with changed semantic handles, implementation/test evidence, boundary
artifacts touched, validation results, and any unresolved semantic conflict.
