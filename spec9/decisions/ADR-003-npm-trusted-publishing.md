---
id: ADR-003
kind: decision
context: delivery
name: Publish npm releases with GitHub OIDC
status: accepted
date: 2026-09-01
relations:
  affects:
    - delivery.github-release
    - delivery.npm-package
    - delivery.publish-npm-package
    - delivery.distribution-validator
---

# Publish npm releases with GitHub OIDC

## Context

Automated npm publication needs registry authority. A long-lived repository
secret can leak, requires rotation, and remains reusable outside the release.

## Decision

GitHub Releases trigger a dedicated workflow that authenticates to npm through
Trusted Publishing and a short-lived OIDC token. Release identity is validated
before the publish step.

## Rejected alternatives

A permanent `NPM_TOKEN` GitHub secret was rejected because its lifetime and
scope exceed one workflow run. Publishing on every tag push was rejected
because a GitHub Release provides a deliberate human release boundary.

## Reconsider when

Reconsider if npm removes Trusted Publishing, if releases move away from GitHub
Actions, or if staged publishing becomes a required approval boundary.
