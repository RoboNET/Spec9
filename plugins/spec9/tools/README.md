# Spec9 engine

The CLI and lint engine require Node.js 20 or later and use ESM. YAML is parsed
with the `yaml` package; Spec9 does not maintain a custom YAML subset.

## Commands

```text
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> lint
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> graph
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> flow <id>
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> draft <kind> <context.id> --name <name>
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> trace [<requirement-id|context.id>] [--missing] [--json]
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> review --base <ref> [--head <ref>] [--json] [--strict]
npx --yes spec9@0.1.0 --spec-root <spec> --product-root <product> change --base <ref> [--head <ref>] [--json]
```

Root options may appear before or after the command. A directory containing
`profile.yaml` is discovered as the specification root; a product directory
containing `spec9/profile.yaml` is also discovered automatically. Environment
variables `SPEC9_SPEC_ROOT` and `SPEC9_PRODUCT_ROOT` provide explicit defaults.

## Structure

- `parse.mjs` parses frontmatter-first pages; relations, requirements,
  evidence, outcomes, partitions, and combinations come only from YAML.
- `markdown.mjs` parses Markdown zones, wiki links, headings, and normative
  operators.
- `combinations.mjs` expands and validates decision-table rows.
- `graph.mjs` loads the profile, entities, relations, anchors, pattern
  obligations, and graph nodes.
- `lint.mjs` implements format and semantic-contract checks.
- `slice.mjs` produces named graph slices for `context` and `why`.
- `flow.mjs` follows causal direction from `relation_types.*.flow`.
- `draft.mjs` prints a profile-aware page skeleton without writing a file or
  inventing domain relations.
- `trace.mjs` maps requirement to subject, evidence, implementation, and
  outcomes. `--missing` keeps gaps only; `--json` is stable CI input.
- `decision.mjs` reports declared/effective ADR state and impact.
- `adapters/` compare declared and escaping outcomes for Rust,
  TypeScript/JavaScript, C#, and Python code anchors.
- `git-snapshot.mjs` materializes a specification at a Git ref without changing
  the worktree.
- `semantic-review.mjs` compares semantic states rather than textual file diffs.

## Profile contract

A profile kind may declare required fields and exact Markdown sections:

```yaml
kinds:
  contract:
    required_fields: [relations.provider, relations.consumers, owner, compatibility]
    required_sections: [Boundary, Compatibility, Failures]
```

Required values must be non-empty. Unknown profile keys are errors: every key
must have an implemented owner or an explicit unsupported reason in
`profile-registry.mjs`.

## Tests

From the repository root:

```bash
npm test
```

Use glob patterns for multiple Node test files; passing a directory directly to
`node --test` is not recursive on the supported Node versions.
