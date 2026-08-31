# Spec9

Spec9 is a domain-addressable specification engine. It stores meaning in
Markdown with YAML frontmatter, builds a graph of terms, requirements,
processes, boundaries, and decisions, and connects them to code, tests,
schemas, and designs through typed anchors.

This repository is three distributions backed by one source tree:

- the `spec9` npm CLI, intended to run with `npx`;
- a Codex plugin and marketplace;
- a Claude Code plugin and marketplace.

The shared plugin lives in `plugins/spec9/`. Skills, format documentation, tools, and
documentation are never copied into vendor-specific variants.

## CLI

After the package is published, run Spec9 without a global installation:

```bash
npx --yes spec9@0.1.0 --spec-root /path/to/product/spec9 \
  --product-root /path/to/product lint
npx --yes spec9@0.1.0 --spec-root /path/to/product/spec9 \
  --product-root /path/to/product review --base HEAD
```

When run from a product root containing `spec9/profile.yaml`, both roots are
discovered automatically. When run from the specification directory containing
`profile.yaml`, the parent directory is used as the product root.

The primary commands are `lint`, `graph`, `flow`, `context`, `trace`,
`decision`, `doctor`, `quality`, `next`, `review`, `change`, `coverage`, `e2e`,
`outcomes`, and `candidates`. Run `npx --yes spec9@0.1.0 --help` for the full
command list.

During development of this repository, `npm exec -- spec9 ...` uses the local
worktree instead of downloading the published package.

## Agent plugins

Both agents consume the same skills:

- `adopt` sets up a product profile and validates its first vertical slice;
- `author` creates and evolves domain pages, requirements, processes,
  boundaries, patterns, and ADRs;
- `implement` drives a product change from semantic context to code, evidence,
  and a `Domain impact` section;
- `review` prepares a top-down semantic review for an existing annotation UI.

Codex metadata is in `.agents/plugins/marketplace.json` and
`plugins/spec9/.codex-plugin/plugin.json`. Claude Code metadata is in
`.claude-plugin/marketplace.json` and
`plugins/spec9/.claude-plugin/plugin.json`.

### Codex

Install the marketplace directly from GitHub, then install the shared plugin:

```bash
codex plugin marketplace add RoboNET/Spec9
codex plugin add spec9@spec9
```

Start a new Codex thread after installation so the four Spec9 skills are loaded.

### Claude Code

Claude Code installation from GitHub:

```text
/plugin marketplace add RoboNET/Spec9
/plugin install spec9@spec9
```

The two catalogs are intentionally thin adapters; `SKILL.md` remains the common
source of behavior.

## Source-of-truth boundaries

- Spec9 owns the format contract, checks, graph traversal, and review views.
- A product profile declares legal kinds, relations, anchors, and slices.
- Code owns internal structure and signatures.
- OpenAPI, AsyncAPI, protobuf, DDL/migrations, JSON Schema, and design tools own
  the shape of published boundaries; Spec9 connects those shapes to domain
  meaning.
- Git owns history. Spec9 does not create a parallel delta tree.

## Development

```bash
npm install
npm run validate
npm pack --dry-run
```

The package and both plugin manifests share one release version. This is a
distribution version, not a version field inside product specifications.
