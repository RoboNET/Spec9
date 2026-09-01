---
id: ADR-002
kind: decision
context: engine
name: Git owns specification change history
status: accepted
date: 2026-08-31
relations:
  affects:
    - engine.semantic-review-engine
    - engine.review-change
---

# Git owns specification change history

## Context

A parallel tree of change artifacts duplicates the repository history and can
drift from the final squashed or rebased change.

## Decision

Git commits are the append-only change journal. Semantic review derives base
and head states from Git, while a merge request carries only a generated Domain
impact view.

## Rejected alternatives

Persistent `changes/<id>/delta.yaml` files were rejected because they repeat
facts already represented by the committed before and after states.

## Reconsider when

Reconsider if a required governance system cannot consume Git history or
generated Domain impact and mandates a separately signed change artifact.
