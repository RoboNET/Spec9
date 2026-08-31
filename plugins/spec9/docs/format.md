# Spec9 Syntax

Spec9 uses ordinary YAML frontmatter followed by Markdown. It introduces no
separate DSL, format version field, or parallel representation.

## Required identity

```yaml
---
id: pam-monitor-ipc
kind: contract
context: runtime
name: IPC between PAM and the monitor daemon
---
```

`id` is unique inside its context. The qualified ID is `context.id`. Every
`kind` must be declared in `profile.yaml`.

## Vocabulary

```yaml
aliases: [IPC, local protocol]
forbidden: [socket] # too broad for this concept
```

`name` is canonical, `aliases` are accepted forms or historical names, and
`forbidden` records wording that hides a meaningful distinction.

## Relations

```yaml
relations:
  transported_by: runtime.pam-monitor-ipc
  handled_by: runtime.monitor-daemon
  writes:
    - runtime.active-session
    - runtime.session-registry
```

A relation value is a qualified ID or a list of IDs. Its key is an edge type
declared under `profile.yaml -> relation_types`. The profile controls
cardinality, allowed endpoint kinds, and causal traversal direction.

A Markdown link is navigational:

```markdown
[[runtime.monitor-daemon|monitor daemon]]
```

It is checked for existence but does not create a graph relation.

## Anchors

```yaml
anchors:
  code: [src/server.rs#perform_handshake]
  type: [src/protocol.rs#ClientMessage]
  schema: [schemas/client-message.json]
  test: [tests/handshake.test.ts]
```

Supported anchor types are `code`, `type`, `test`, `schema`, `exemplar`, and
`counterexample`. Each profile kind declares required and optional types.
`#symbol` is optional, but preferred for code and type anchors.

If a required anchor is impossible by design, declare the reason:

```yaml
no_anchor:
  type: an external human actor has no program type
```

## Requirements

```yaml
requirements:
  IPC-001:
    kind: contract
    origins: ["ipc-protocol::Hello precedes application messages"]
    decided_by: [runtime.ADR-005]
    subjects: [runtime.pam-monitor-ipc]
    evidence:
      schema: [schemas/client-message.json]
      test: [tests/handshake.test.ts]
    outcomes: [accepted, incompatible version, invalid first frame]
    partitions:
      - outcome: invalid first frame
        total: true
        classes: [application message, unknown variant, invalid payload]
```

Every requirement key has a matching Markdown heading and normative sentence:

```markdown
### IPC-001 — Hello precedes application messages

[[runtime.pam-monitor-ipc|The IPC contract]] MUST accept only `Hello` as its
first frame.
```

The heading and prose are not duplicate metadata stores. The ID connects prose
to frontmatter; kind, subjects, evidence, and outcomes come only from YAML.
Every subject appears as a typed wiki link near the normative operator.

`decided_by` is optional and contains qualified ADR IDs only when an explicit
choice created the requirement. `origins` is migration provenance in the form
`<capability>::<exact OpenSpec Requirement heading>`.

## Decisions

Do not rewrite an accepted decision when the choice changes. Add a new decision
that declares replacement or revocation and broad impact:

```yaml
id: ADR-006
kind: decision
context: runtime
status: proposed
date: 2026-08-31
relations:
  replaces: [runtime.ADR-005]
  affects:
    - runtime.pam-monitor-ipc
    - runtime.open-monitored-session
```

After acceptance, `status` becomes `accepted`; the previous decision's
effective status is derived from incoming accepted relations.

## Process outcomes

File-level outcomes apply to the whole process:

```yaml
outcomes:
  - succeeded
  - business refusal
  - indeterminate refusal
  - retry budget exhausted
  - external actor timed out
```

## Decision tables

```yaml
combinations:
  - dimensions:
      mode: [none, crl, ocsp]
      source: [present, missing]
    rows:
      - when: { mode: none, source: "*" }
        outcome: valid
      - when: { mode: crl, source: missing }
        outcome: null
        note: behavior is not decided yet
```

`*` expands to every value in a dimension. `null` is an explicit gap, not a
wildcard.

## Patterns

A pattern declares ordinary requirements with `subjects: [application]`.
Applications bind domain concepts and provide conformance evidence:

```yaml
applies:
  - pattern: fail-closed
    bindings:
      indeterminate: auth.ADR-002
conformance:
  fail-closed/FC-001:
    test: [tests/access.yaml]
  fail-closed/FC-002:
    code: [src/revocation.ts#checkRevocation]
```

Bindings accept qualified IDs only. Patterns have no format-level version.

## Boundary profile fields

Kinds may require additional ordinary YAML fields:

```yaml
# interface
relations: { actor: auth.login-subject }
entrypoint: src/login.ts#renderLogin

# contract
relations:
  provider: runtime.monitor-daemon
  consumers: [auth.pam-module]
owner: runtime
compatibility: additive-fields-within-v2

# configuration
owner: auth.operator
source: /etc/example/config.toml
reload: each-request-and-daemon-start

# persistence
owner: runtime
format: JSON snapshot
compatibility: additive-fields-with-defaults
```

Required fields and Markdown sections are declared in `profile.yaml`; the
engine does not hardcode product kind names.
