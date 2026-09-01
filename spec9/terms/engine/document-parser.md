---
id: document-parser
kind: component
context: engine
name: Specification document parser
relations:
  implements: [engine.authoring-format]
  depends_on: [engine.authoring-format]
anchors:
  code:
    - plugins/spec9/tools/yaml.mjs#parseFrontmatter
    - plugins/spec9/tools/parse.mjs#parseSpecFile
  test:
    - plugins/spec9/tools/frontmatter.test.mjs
requirements:
  ENG-001:
    kind: invariant
    subjects: [engine.document-parser]
    evidence:
      test: [plugins/spec9/tools/frontmatter.test.mjs#parseFrontmatter]
  ENG-002:
    kind: invariant
    subjects: [engine.document-parser]
    evidence:
      test: [plugins/spec9/tools/frontmatter.test.mjs#findLinks]
---

# Specification document parser

The parser converts frontmatter and Markdown into one in-memory document while
preserving stable file and line locations for findings.

### ENG-001 — Invalid YAML is never accepted partially

[[engine.document-parser|The document parser]] MUST reject duplicate keys,
truncated YAML, and frontmatter whose root is not an object.

### ENG-002 — Masked Markdown cannot create structure

[[engine.document-parser|The document parser]] MUST NOT extract requirements,
evidence, or wiki links from code blocks or quotations.
