# Feature: Branch naming

## Purpose

Keep fix/feature work traceable to a product version and a short description of the change.

## Bug / fix branches (required)

```
bug/[version]-[what-you-fixed]
```

| Part | Rules |
|------|--------|
| `bug/` | Literal prefix for patch-level fixes and corrective user-visible work. |
| `[version]` | Target product version after the bump (same as `APP_VERSION`, e.g. `0.2.1`). |
| `[what-you-fixed]` | Lowercase kebab-case summary of the fix (2–6 words). |

Examples:

- `bug/0.2.1-play-verification-settlement`
- `bug/0.2.1-play-verify-and-prediction-book`
- `bug/0.3.0-caddy-optional-domain`

### Checklist when opening a bug branch

1. Bump the **patch** (or agreed) version in `packages/shared/src/app-version.ts` and all workspace `package.json` `version` fields.
2. Name the branch `bug/<that-version>-<kebab-summary>`.
3. Open a PR into `development` (not direct push).
4. Mention the version in the PR title or body (e.g. `v0.2.1`).

## Other prefixes (optional)

| Prefix | Use |
|--------|-----|
| `feat/` | New capability that is not primarily a bugfix (still bump version when user-visible). |
| `chore/` | Tooling, deps, non-product chores. |
| `harden/` | Security / exposure hardening without a user-facing bug narrative. |

Prefer `bug/[version]-…` whenever the work corrects incorrect product behaviour or ships a patch release.

## Flow

`bug/…` or `feat/…` → PR → `development` → PR → `production` → Actions deploy.

See [software-docs.md](../software-docs.md) and [versioning.md](./versioning.md).
