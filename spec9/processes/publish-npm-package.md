---
id: publish-npm-package
kind: process
context: delivery
name: Publish an npm release
relations:
  triggered_by: delivery.github-release
  invokes: [delivery.distribution-validator]
  publishes: delivery.npm-package
  references: [delivery.ADR-003]
anchors:
  code:
    - .github/workflows/publish-npm.yml#publish
    - scripts/verify-release.mjs#releaseTag
  test:
    - scripts/verify-release.test.mjs
outcomes:
  - package published with provenance
  - release metadata rejected
  - validation or packing rejected
  - npm registry rejected publication
  - npm registry timed out
requirements:
  PUB-001:
    kind: invariant
    decided_by: [delivery.ADR-003]
    subjects: [delivery.publish-npm-package]
    evidence:
      test: [scripts/verify-release.test.mjs#verify]
  PUB-002:
    kind: operational
    decided_by: [delivery.ADR-003]
    subjects: [delivery.publish-npm-package]
    evidence:
      code: [.github/workflows/publish-npm.yml#id-token]
  PUB-003:
    kind: operational
    subjects: [delivery.publish-npm-package]
    evidence:
      code: [.github/workflows/publish-npm.yml#timeout-minutes]
---

# Publish an npm release

A published GitHub Release checks out its exact tag on a GitHub-hosted runner,
validates release identity and the full distribution, inspects the package, and
publishes through npm Trusted Publishing.

### PUB-001 — Release tag and package version agree

[[delivery.publish-npm-package|The npm publication process]] MUST reject a
release whose tag or prerelease flag disagrees with `package.json`.

### PUB-002 — Publication uses short-lived identity

[[delivery.publish-npm-package|The npm publication process]] MUST request an
OIDC identity token. [[delivery.publish-npm-package|The npm publication process]]
MUST NOT require a steady-state `NPM_TOKEN` secret.

### PUB-003 — Every accepted release reaches a terminal publication outcome

[[delivery.publish-npm-package|The npm publication process]] MUST terminate as
either a provenance-backed publication or an explicit metadata, validation,
registry, or timeout failure.

The main outcome is `package published with provenance`. Metadata, validation,
and registry refusals are distinct. The external registry step may time out;
GitHub Actions owns the execution timeout and exposes the failed run.
