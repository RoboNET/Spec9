---
id: github-release
kind: contract
context: delivery
name: GitHub Release publication event
owner: RoboNET
compatibility: release tag is exactly v followed by the package SemVer
anchors:
  schema:
    - .github/workflows/publish-npm.yml
  test:
    - scripts/verify-release.test.mjs
requirements:
  PUB-004:
    kind: contract
    subjects: [delivery.github-release]
    evidence:
      schema: [.github/workflows/publish-npm.yml]
      test: [scripts/verify-release.test.mjs#verify]
---

# GitHub Release publication event

## Boundary

A maintainer publishes a GitHub Release. Its tag and prerelease flag are the
only external inputs that authorize the npm publication workflow to begin.

## Compatibility

The event tag remains `v<package.version>`. A stable release maps to npm
`latest`; a SemVer prerelease maps to `next`.

## Failures

Draft releases do not trigger publication. A published release with mismatched
metadata triggers the workflow but is rejected before npm authentication.

### PUB-004 — Only a published release starts publication

[[delivery.github-release|The GitHub Release event]] MUST trigger npm
publication only after the release reaches the `published` state.
