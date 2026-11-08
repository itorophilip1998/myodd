# Feature: Authentication & accounts

## Purpose

Sign users in with Clerk, map each Clerk identity to a durable local `AppUser`, and gate private collections / preferences on that account.

## Ownership

| Layer | Location |
|-------|----------|
| Web UI | `apps/web/src/app/sign-in`, `sign-up`, `components/AccountSession.tsx`, `middleware.ts` |
| Config | `apps/web/src/lib/clerk-config.ts`, `apps/web/.env.local` |
| API | `apps/api/src/auth/*`, `account.controller.ts` |
| Model | Prisma `AppUser` |

## Behaviour

1. Clerk hosts sign-in / sign-up (username+password and optional Google on the linked instance).
2. Web middleware protects routes that require a session when Clerk keys are configured.
3. Client sends the Clerk bearer token on API calls; `AuthService` verifies it and upserts `AppUser` by `clerkId`.
4. `POST /api/account/sync` refreshes local profile fields (e.g. username) for display on public creator labels.
5. Preferences and owned collections attach to `AppUser.id`, not the raw Clerk id in public APIs.

## Guards

- `ClerkGuard` — optional/required session depending on route.
- `SignedInGuard` — requires a mapped account for mutating personal resources.

## Env

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (web `.env.local`, also injected into API).
- `CLERK_AUTHORIZED_PARTIES` / `CORS_ORIGIN` — trusted frontend origins for token verification.

## Out of scope

- No Clerk Organizations / multi-tenant orgs.
- No password store in Postgres — Clerk is the IdP.
- Legacy guest collections are not auto-claimed on first login.
