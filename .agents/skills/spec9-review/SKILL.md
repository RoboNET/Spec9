---
name: spec9-review
description: Review Spec9 changes as a semantic, top-down document and route them to an existing annotation UI such as Plannotator. Use for human review of terms, norms, processes, boundaries, decisions, relations, and evidence; not for ordinary source-code review.
---

# Spec9 Review

Treat the `spec9` CLI as the review engine and an existing annotator as
the presentation layer. Do not build or persist a separate review UI, comment
database, semantic delta tree, or HTML renderer.

## Start the review

Choose a Git base from the user's request or known MR target. For uncommitted
work, `HEAD` is the natural base. Do not silently choose a branch target when
several are plausible.

Generate the review document with the bundled helper:

```bash
node <spec9-repo>/.agents/skills/spec9-review/scripts/prepare-review.mjs \
  --product-root <repo> --spec-root <repo/spec9> --base <ref> [--head <ref>]
```

The helper prints a temporary Markdown path. It delegates all semantic work to
`spec9 review --base ...`; it does not interpret the domain itself.

## Presentation routing

Prefer the renderer or annotator named by the user.

- For Plannotator, use the `plannotator-annotate` skill on the generated
  Markdown file. Wait for the review session and process returned annotations.
- For another installed review tool, pass it the same Markdown document using
  its documented interface. Inspect local help or its skill first; never invent
  `revdiv`, `revdiff`, or `revmux` commands.
- If no annotator is available, present the Markdown in chat without changing
  its hierarchy.

Delete the temporary document after annotations have been captured:

```bash
node <spec9-repo>/.agents/skills/spec9-review/scripts/prepare-review.mjs \
  --cleanup <temporary-review.md>
```

## Human reading order

Preserve the engine's top-down order:

1. risk and semantic counts;
2. affected contexts and unmapped files;
3. boundaries;
4. decisions and append-only ADR violations;
5. terms and requirements;
6. causal relations;
7. anchors and evidence;
8. commands for focused review.

Do not flood the first pass with full pages, code, or raw JSON. Keep stable
handles (`context.id`, requirement ID, relation triple, ADR ID, anchor target)
visible so a comment can be mapped back without guessing.

When the reviewer asks to drill down, generate only the requested focused view:

- requirement: `spec9 --spec-root <path> --product-root <path> context <REQ-ID> --slice review`;
- decision: `spec9 --spec-root <path> --product-root <path> decision <context.ADR-id>`;
- process: `spec9 --spec-root <path> --product-root <path> flow <context.id>`;
- code rationale: `spec9 --spec-root <path> --product-root <path> why <path>#<symbol>`.

Open that focused Markdown in the same annotator when useful. Do not expand all
items pre-emptively.

## Handling feedback

Map every annotation to its stable semantic handle and classify it as:

- accepted/no action;
- question requiring an explanation or focused view;
- requested spec/code change;
- blocking semantic conflict.

Annotations are review input, not a new source of truth. Do not write them into
permanent delta files. Apply explicit requested changes to the owning spec/code,
rerun semantic review, and let Git/MR retain the durable conversation. A comment
requesting alteration of an accepted ADR must become a new `replaces`/`revokes`
decision rather than an edit to the old ADR.

Finish with a short resolution summary: blocking comments, applied changes,
open questions, and verification results.
