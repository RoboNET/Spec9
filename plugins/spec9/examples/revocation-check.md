---
id: revocation-check
kind: operation
context: auth
name: Revocation check
relations:
  references: [auth.credential, auth.crl, auth.ocsp-responder]
anchors:
  code: [src/revocation.ts#checkRevocation]
  test: [tests/revocation.yaml]
requirements:
  REV-002:
    kind: invariant
    subjects: [auth.revocation-check]
    evidence:
      test: [tests/revocation.yaml]
    outcomes: [valid, revoked, indeterminate]
---

# Revocation check

## Purpose

Determines the status of a [[auth.credential|credential]] from published
revocation sources.

### REV-002 — Indeterminate status rejects access

[[auth.revocation-check|The revocation check]] MUST reject access when it
cannot determine the credential status.

#### Scenario: Responder unavailable

- **WHEN** the responder is unavailable and there is no valid cache entry
- **THEN** the outcome is `indeterminate`
