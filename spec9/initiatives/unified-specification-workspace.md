---
id: unified-specification-workspace
kind: initiative
context: engine
name: One place for ideas, decisions, requirements, and deliveries
status: delivering
relations:
  references:
    - engine.authoring-format
    - engine.product-profile
    - engine.lint-engine
    - engine.cli
---

# One place for ideas, decisions, requirements, and deliveries

Capture an idea or a problem in the specification repository without requiring an
ADR, detailed requirements, evidence, an owner, or a delivery plan first.
Keep this initiative as the entry point as the work becomes more concrete.

Initiatives describe intent, ADRs explain choices, domain pages own requirements,
and deliveries pin the editions being supplied. These remain separate linked
objects, not successive replacements of one universal card. An initiative's
status does not accept a decision or promise delivery of a requirement.

## Current scope

The product profile provides the initiative kind and its lifecycle. Existing
drafting, graph, and lint support are reused; there is no engine-owned backlog
schema. The linked format, profile, lint, and CLI pages own the relevant
contracts rather than duplicating requirements here.

A completed delivery continues to cover its recorded edition while that edition
is current. A changed requirement needs new coverage; the previous completed
record remains history.

## Follow-up

Use this structure on real initiatives before adding prioritization, backlog
views, or automation. Product-repository PR spec-impact checks remain separate
work; this initiative does not introduce them.
