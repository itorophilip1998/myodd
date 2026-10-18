# Feature: App versioning

## Purpose

Show which product version (and deploy commit) is running, so updates are visible on the create page and in health checks.

## Source of truth

Bump these together when shipping user-visible changes:

1. `packages/shared/src/app-version.ts` → `APP_VERSION`
2. Root / workspace `package.json` `version` fields (kept in sync at `0.2.0+`)

`formatAppVersion(gitSha)` renders `v0.2.0` or `v0.2.0 · a1b2c3d`.

## Where it appears

- Create page composer footer — bold label under the input (`GenerateForm`).
- `GET /api/health` → `{ version, gitSha, label }`.

## Deploy bake-in

- GitHub Actions passes `APP_GIT_SHA=$GITHUB_SHA` into `deploy-remote.sh`.
- Compose build args set `NEXT_PUBLIC_APP_GIT_SHA` (web) and `APP_GIT_SHA` (api).
- Local builds default to `local` (no sha suffix in the UI label beyond `vX.Y.Z`).
