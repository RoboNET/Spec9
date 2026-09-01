---
id: distribution-validator
kind: component
context: delivery
name: Cross-agent distribution validator
relations:
  implements:
    - delivery.agent-plugin
    - delivery.npm-package
  depends_on:
    - delivery.agent-plugin
    - delivery.npm-package
anchors:
  code:
    - scripts/validate-distribution.mjs#skillNames
  test:
    - scripts/validate-distribution.mjs
requirements:
  DST-001:
    kind: invariant
    subjects: [delivery.distribution-validator]
    evidence:
      test: [scripts/validate-distribution.mjs#expectedVersion]
  DST-002:
    kind: invariant
    subjects: [delivery.distribution-validator]
    evidence:
      test: [scripts/validate-distribution.mjs#codexMarketplace]
---

# Cross-agent distribution validator

The validator treats npm, Codex, and Claude Code metadata as projections of one
release and prevents them from drifting before publication.

### DST-001 — Distribution versions agree

[[delivery.distribution-validator|The distribution validator]] MUST require the
npm package and both plugin manifests to declare one release version.

### DST-002 — Marketplace adapters point to the shared plugin

[[delivery.distribution-validator|The distribution validator]] MUST require
both marketplaces and manifests to resolve the same shared plugin and skill
tree.
