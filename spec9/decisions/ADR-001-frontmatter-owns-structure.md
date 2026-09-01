---
id: ADR-001
kind: decision
context: engine
name: Frontmatter owns machine-readable structure
status: accepted
date: 2026-08-31
relations:
  affects:
    - engine.authoring-format
    - engine.document-parser
    - engine.product-profile
---

# Frontmatter owns machine-readable structure

## Context

Normative prose must remain readable, but extracting identity, relations, or
evidence heuristically from prose makes validation noisy and ambiguous.

## Decision

YAML frontmatter is the only machine-readable source. Markdown explains meaning
and contains explicitly marked normative sentences connected by stable IDs.

## Rejected alternatives

A dedicated DSL was rejected because it duplicates Markdown and evolves into a
second programming language. Heuristic prose extraction was rejected because
false positives make strict lint unusable.

## Reconsider when

Reconsider only if a broadly adopted standard can preserve the same human
readability, stable identity, and deterministic parsing without dual sources.
