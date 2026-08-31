# Spec9 development

- Keep the engine product-independent. Product kinds and legal relations belong in `profile.yaml`.
- Run `npm test` after changing the parser, graph, lint, review, or adapters.
- Run `npm run validate:skills` after changing `plugins/spec9/skills/` or either plugin manifest.
- Keep reusable documentation, skills, manifests, CLI help, and diagnostics in English. Product specifications may use their domain language.
- Keep shared Agent Skills in `plugins/spec9/skills/`; do not create vendor-specific copies.
- Do not introduce a second source of truth for code shapes or Git history.
