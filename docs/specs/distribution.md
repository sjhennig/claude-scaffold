# Distribution Spec

<!--
Living doc — update this whenever how the CLI is packaged, pack-tested, or
published changes. Registered in docs/specs/subsystem-map.json so the drift
hook watches the pack-test script and the publish workflow.
-->

## Purpose

How the scaffold CLI reaches users (M8): published to npm as the scoped
package **`@sjhennig/claude-scaffold`**, kicked off with
`npx @sjhennig/claude-scaffold`. The unscoped npm name `claude-scaffold`
belongs to an unrelated tool; the **binary** is still `claude-scaffold`
(the `bin` field, not the package name, names the command). The CLI's version
stream (`cli-vX.Y.Z` tags, npm semver) is deliberately independent of the
plugin's (`guardrails-vX.Y.Z`) — see the M7/M8 NOTES decisions.

## Owning files

- `scripts/pack-test.mjs` (`npm run test:pack`) — self-verification of the
  artifact: packs the working tree, asserts tarball contents (runtime files
  in, colocated tests out), installs the tarball into a clean prefix, proves
  the installed bin executes, and scaffolds + verifies a `none` project from
  the installed package. Runs as the per-PR `pack` CI job and as the publish
  workflow's last gate. (Lands with the packaging PR; register it in the
  subsystem map once both it and this spec are on main — the map's dogfood
  test requires mapped files to exist on disk.)
- `.github/workflows/publish.yml` — publishes on `cli-v*` tag push: tag/version
  match guard → `npm run verify` → `npm run test:pack` →
  `npm publish --provenance --access public`.
- `package.json` packaging fields (documented here, not drift-watched — the
  file churns with dependency bumps): `name`, `bin`, `files`
  (`["bin/", "src/", "!src/**/*.test.js"]` — the negation keeps the ten
  colocated tests out), `publishConfig.access: public`, `engines`.

## Releasing the CLI

1. Bump `version` in `package.json` (+ lockfile via
   `npm install --package-lock-only`) in a PR; merge it.
2. Tag the merge commit: `git tag cli-v<version> && git push origin
cli-v<version>`. The tag fires the publish workflow; nothing publishes
   without a tag, and the guard step refuses a tag that doesn't match
   `package.json`.
3. Confirm the workflow's publish step succeeded (npm shows the new version
   with provenance).

Unlike the plugin's `guardrails-v*` bootstrap (tag had to exist _before_ the
pin merged, because downstream references it), the CLI tag comes _after_ the
workflow merges — the tag is what fires the publish. Nothing downstream pins
CLI versions.

## Invariants & constraints

- **The tag is the version claim, and only main publishes.** `cli-vX.Y.Z`
  must equal `package.json` `version`, and the tagged commit must be an
  ancestor of `main` — both enforced by the workflow's guard step before even
  `npm ci` runs (so a bad tag never executes third-party install scripts, and
  a tagged side-branch commit can't ship unreviewed code).
- **The pack test gates every publish** (and every PR): a file missing from
  the `files` allowlist fails CI instead of shipping a broken npx experience.
- **Publishing requires `id-token: write`** (for `--provenance`) and the
  `NPM_TOKEN` secret; everything else in the workflow is read-only.
- **The npm package and the plugin are independent artifacts.** Generated
  projects load the plugin from the GitHub marketplace (`guardrails-v*` pin);
  publishing the CLI changes nothing downstream.

## Edge cases

- **Tag without a matching version bump** → guard step fails; nothing
  publishes; delete the tag, fix, re-tag.
- **Missing `NPM_TOKEN`** → publish step fails after verify+pack (nothing
  partially published; npm publish is atomic per version).
- **Re-running a failed publish** → push the same tag again after deleting it,
  or re-run the workflow run; npm refuses double-publishing a version, which
  is the correct backstop.

## Open decisions

- **Migrate auth to npm Trusted Publishing (OIDC)** once the package exists:
  configure the publisher on npmjs.com for this repo + workflow file, then
  drop the `NPM_TOKEN` secret and the `NODE_AUTH_TOKEN` env. Trusted
  Publishing cannot bootstrap a first publish, which is why the token path
  ships first.
