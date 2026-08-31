# Engine audit record

This file preserves the scope and conclusions of the original implementation
audit performed on 2026-08-30. The detailed findings were converted into
regression tests and profile ownership checks; tests are the durable evidence
that the fixes remain active.

## Critical classes covered

- Markdown code and quote zones cannot create requirements or evidence.
- Every used profile key has an explicit implementation owner.
- Failed outcome comparison returns a failing exit code.
- YAML parsing rejects truncation and duplicate keys.
- Rust and TypeScript adapters preserve panic and throw outcomes.

## High-risk classes covered

- Multiline `MUST NOT` remains a prohibition.
- Invalid pattern applications are not silently ignored.
- Degenerate decision tables are not reported as total.
- Evidence anchors resolve a declared file and symbol rather than an arbitrary
  substring.

## Structural conclusions

- Frontmatter is the only machine-readable source for requirements, relations,
  evidence, outcomes, partitions, combinations, and conformance.
- A profile is executable configuration, not aspirational documentation.
- Lint correctness and semantic quality are separate signals.
- Graph traversal is bounded by file budget and reports degraded nodes instead
  of silently dropping them.
- Accepted decisions are protected by semantic base/head review.

Run `npm test` from the repository root for the regression suite and
`npm run validate:skills` for cross-agent distribution checks.
