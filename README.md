# Spec9

[![npm](https://img.shields.io/npm/v/spec9)](https://www.npmjs.com/package/spec9)
[![license](https://img.shields.io/npm/l/spec9)](LICENSE)

Spec9 is a domain-addressable specification engine. It stores meaning in
Markdown with YAML frontmatter, builds a graph of terms, requirements,
processes, boundaries, and decisions, and connects them to code, tests,
schemas, and designs through typed anchors.

This repository is three distributions backed by one source tree:

- the `spec9` npm CLI, intended to run with `npx`;
- a Codex plugin and marketplace;
- a Claude Code plugin and marketplace.

The engine also describes itself with Spec9 under `spec9/`. Its README is the
top-down review entry point; `npm run validate:self` checks that specification
with the engine it describes.

The shared plugin lives in `plugins/spec9/`. Skills, format documentation, tools, and
documentation are never copied into vendor-specific variants.

## CLI

The CLI is published as [`spec9` on npm](https://www.npmjs.com/package/spec9).
Run the current stable release without a global installation:

```bash
npx --yes spec9@latest --spec-root /path/to/product/spec9 \
  --product-root /path/to/product lint
npx --yes spec9@latest --spec-root /path/to/product/spec9 \
  --product-root /path/to/product review --base HEAD
```

When run from a product root containing `spec9/profile.yaml`, both roots are
discovered automatically. When run from the specification directory containing
`profile.yaml`, the parent directory is used as the product root.

The primary commands are `lint`, `graph`, `flow`, `context`, `trace`,
`decision`, `doctor`, `quality`, `next`, `review`, `change`, `coverage`, `e2e`,
`outcomes`, and `candidates`. Run `npx --yes spec9@latest --help` for the full
command list.

Requirement handles are context-qualified (`auth.REVS-001`), just like terms.
Unqualified requirement IDs are accepted only as a compatibility alias when
they resolve uniquely. `doctor` separates integrity failures, implementation
gaps, planned work, and maturity signals. `e2e --strict` requires exact
case-level evidence; `e2e --suggest` prints reviewed frontmatter additions
without writing them.

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
- OpenAPI, AsyncAPI, protobuf, DDL/migrations, JSON Schema, configuration, and
  design tools own the shape of published boundaries; Rust and TypeScript can
  also be authoritative source-shaped boundaries. Spec9 connects those shapes
  to domain meaning and reviews supported shape deltas through fail-closed
  adapters.
- Git owns history. Spec9 does not create a parallel delta tree.

An umbrella product may declare several exact Git roots in `profile.yaml`.
`review`, `change`, and `--seed-git` then combine their changed files while
preserving product-relative paths, and Git snapshots load anchored boundary
sources from the corresponding repository at the selected ref.

## Development

```bash
npm install
npm run validate
npm pack --dry-run
```

The package and both plugin manifests share one release version. This is a
distribution version, not a version field inside product specifications.

## Publishing releases

Publishing is handled by `.github/workflows/publish-npm.yml` through npm Trusted
Publishing. To release a version:

1. Update `version` in `package.json` and `package-lock.json`. The plugin
   manifests are checked against that version by `npm run validate`.
2. Merge the version change to `main` and create a GitHub Release whose tag is
   exactly `v<version>`, for example `v0.1.1`.
3. Publishing the GitHub Release validates, packs, and publishes the package.
   Stable versions use the npm `latest` tag; SemVer prereleases use `next`.

The npm package trusts this publisher configuration:

- provider: GitHub Actions;
- organization: `RoboNET`;
- repository: `Spec9`;
- workflow filename: `publish-npm.yml`;
- allowed action: `npm publish`.

Version `0.1.0` bootstrapped the package. Later releases use short-lived GitHub
OIDC credentials and npm provenance; the repository does not need an
`NPM_TOKEN` secret.
