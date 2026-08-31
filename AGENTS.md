# Spec9 development

- Keep the engine product-independent. Product kinds and legal relations belong in `profile.yaml`.
- Run `npm test` after changing the parser, graph, lint, review, or adapters.
- Run `npm run validate:skill` after changing `.agents/skills/spec9-review`.
- Do not introduce a second source of truth for code shapes or Git history.
