---
id: cli
kind: component
context: engine
name: Spec9 command-line interface
relations:
  depends_on:
    - engine.specification-repository
    - engine.lint-engine
    - engine.semantic-review-engine
anchors:
  code:
    - plugins/spec9/tools/spec.mjs#main
  test:
    - plugins/spec9/tools/extended-commands.test.mjs
requirements:
  CLI-001:
    kind: operational
    subjects: [engine.cli]
    evidence:
      code: [plugins/spec9/tools/spec.mjs#resolveRoots]
      test: [scripts/engine-contract.test.mjs#CLI-001]
  CLI-002:
    kind: invariant
    subjects: [engine.cli]
    evidence:
      test: [scripts/engine-contract.test.mjs#CLI-002]
---

# Spec9 command-line interface

The CLI resolves product and specification roots, routes commands, formats
human or JSON output, and communicates failure through process exit status.

### CLI-001 — Roots are explicit or discovered deterministically

[[engine.cli|The command-line interface]] MUST use explicit root options when
provided. [[engine.cli|The command-line interface]] MUST otherwise discover only
a current `profile.yaml` or product-local `spec9/profile.yaml`.

### CLI-002 — Broken output pipes are not engine failures

[[engine.cli|The command-line interface]] MUST tolerate `EPIPE` when a downstream
consumer closes standard output early.
