# Engine audit — 2026-08-30

This is a historical engineering record, not current user documentation and not
a normative specification. It is kept outside `plugins/spec9/docs/` so it is
not mistaken for part of the authoring format.

The audit labels referenced in source comments identify regression classes from
the initial engine review. The durable sources of truth are now:

- the self-hosted engine specification under `spec9/`;
- executable checks in `plugins/spec9/tools/`;
- regression tests beside those checks.

## Regression classes retained

| Labels | Concern | Durable evidence |
| --- | --- | --- |
| C2, P1–P7 | Every executable profile key has an implementation owner | `profile-registry.mjs`, `profile-registry.test.mjs` |
| C3 | Outcome comparison failures propagate a failing status | `outcomes-cmd.mjs`, extended command tests |
| H2–H5 | Patterns, decision tables, scenarios, and anchors cannot fail silently | `frontmatter.test.mjs` |
| M2, C7 | Normative operators and escaping outcomes survive multiline or semicolon-free syntax | parser and adapter tests |
| M5, M9–M11 | Source traversal, indexes, and context-qualified identity remain explicit | graph, lint, and semantic-review tests |
| M15–M17 | Symbols, undefined combinations, and frontmatter ownership remain precise | adapter, combination, and outcome tests |

The original prose findings were intentionally not preserved as a second active
backlog. Git retains their history; tests and Spec9 requirements retain the
behavior that still matters.
