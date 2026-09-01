---
id: npm-package
kind: contract
context: delivery
name: Public npm package
owner: RoboNET
compatibility: semantic package versions and stable spec9 executable name
anchors:
  schema:
    - package.json
  test:
    - scripts/verify-release.test.mjs
requirements:
  PKG-001:
    kind: contract
    subjects: [delivery.npm-package]
    evidence:
      schema: [package.json]
      test: [scripts/verify-release.test.mjs#packageVersion]
  PKG-002:
    kind: invariant
    subjects: [delivery.npm-package]
    evidence:
      test: [scripts/verify-release.test.mjs#verify]
---

# Public npm package

## Boundary

The package exposes the `spec9` executable and selected programmatic modules to
users running `npx` or consuming the engine from Node.js.

## Compatibility

The executable name remains `spec9`. Package versions follow SemVer and are the
shared distribution version for npm and both agent manifests.

## Failures

A release is rejected before publication when its GitHub tag, prerelease flag,
package version, plugin versions, tests, or packed file set disagree.

### PKG-001 — Package metadata names the public repository

[[delivery.npm-package|The npm package]] MUST publish as a public package whose
repository metadata points to `RoboNET/Spec9`.

### PKG-002 — Release identity is exact

[[delivery.npm-package|The npm package]] MUST be published only from a GitHub
Release tag exactly equal to `v<package.version>`.
