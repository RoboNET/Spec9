---
id: agent-plugin
kind: contract
context: delivery
name: Shared Codex and Claude Code plugin
owner: RoboNET
compatibility: one shared skill tree with vendor-specific manifests
anchors:
  schema:
    - plugins/spec9/.codex-plugin/plugin.json
    - plugins/spec9/.claude-plugin/plugin.json
    - .agents/plugins/marketplace.json
    - .claude-plugin/marketplace.json
  test:
    - scripts/validate-distribution.mjs
requirements:
  PLG-001:
    kind: invariant
    subjects: [delivery.agent-plugin]
    evidence:
      test: [scripts/validate-distribution.mjs#skillNames]
  PLG-002:
    kind: invariant
    subjects: [delivery.agent-plugin]
    evidence:
      test: [scripts/validate-distribution.mjs#codexMarketplace]
---

# Shared Codex and Claude Code plugin

## Boundary

Codex and Claude Code load vendor-specific manifests that point to the same
`plugins/spec9/skills` tree and the same engine documentation and tools.

## Compatibility

Manifest versions match the npm package version. Skills remain portable
Markdown instructions and vendor-specific metadata stays a thin adapter.

## Failures

Distribution validation rejects copied skill trees, mismatched versions,
unexpected skills, non-English public instructions, or incorrect marketplace
source paths.

### PLG-001 — Skills have one source of truth

[[delivery.agent-plugin|The agent plugin]] MUST expose exactly one shared skill
tree to Codex and Claude Code.

### PLG-002 — Public agent instructions are English

[[delivery.agent-plugin|The agent plugin]] MUST keep reusable skills and agent
metadata in English.
