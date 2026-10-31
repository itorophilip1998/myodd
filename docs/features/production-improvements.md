# Production improvements — v0.2.15

This release extends the existing Next.js, NestJS, FastAPI, Prisma/PostgreSQL, and Redis/BullMQ services. It preserves the single result badge work: OPEN, LIVE, CUT, WIN, UNKNOWN, with settlement/progress details inside tickets.

## Delivered behavior

- Home and Generate are separate pages. Primary navigation is Home, Generate, Codes, Settings; Codes retains `/history`. Live and Predictions remain secondary links. Prediction-book actions now open `/generate?book=1`.
- Code strings copy only the code, with “Code copied!” feedback, keyboard support, and manual-selection fallback. Detail controls are separate. Toasts support Dismiss all.
- One central formatter renders `v<version>.<short-git-sha>`, or `v<version>` without a valid hash. The footer and signed-in profile menu replace header/build badges.
- Contextual collection titles and one editable save dialog support private/public visibility in the same atomic save. Guest sign-in preserves the dialog draft. Ownership claims are concurrency-safe; successful authenticated tickets automatically appear privately in Codes.
- System/Light/Dark preferences apply before paint, persist locally, and synchronize through account settings. Pending local edits survive delayed reads and sync failures. Per-account caches are isolated from guest settings.
- The searchable grouped market picker uses a versioned shared registry plus actual observed provider markets. Unknown intervals are not fabricated. Typed mode and market controls override prompt preferences; Auto is the default. Common date prompts use Lagos calendar dates.
- Diversification prefers distinct events and rejects repeated exact selection keys across a batch, except deliberately preserved original picks. Insufficient pools return fewer tickets and explain the limitation.
- Result pages retain previously loaded tickets after refresh failures, validate response shapes, expose actionable error/empty states, and show requested/generated/failed counts. Error boundaries cover render failures.
- Generation request UUIDs are scoped by account or HTTP-only guest session and serialized with PostgreSQL advisory locks. Retries reuse the existing group/job; changed payloads return 409.
- Booking confirmations are journaled durably. Interrupted provider writes without confirmation are reported as uncertain rather than automatically repeated. Successful accepted codes can be recovered from PostgreSQL or durable queue data.
- Read coalescing, query freshness, negative lookup caching, and interpretation caching reduce duplicate work. Booking creation remains uncached and final validation uses fresh provider data. Private supplied codes are not automatically promoted into the public generation catalog.
- Collection lifecycle tracking distinguishes final selection settlement from actual match completion. All collection types receive a 24-hour retention clock only after every relevant match/result is confirmed final. Corrections reset the clock.
- Public metadata and sitemap queries require public visibility. Private collections, raw codes, result URLs, sign-in, and Settings are non-indexable. Public pages have canonical/social metadata and responsible-gambling information.

## Interfaces and migration

Existing generation URLs, 202 responses, job statuses, and response fields remain available. Additive generation input fields are `requestId`, `riskMode`, `selectedMarketIds`, and `matchDateEnd`. Explicit market IDs resolve to the existing Python `marketRules` configuration rather than adding a second generation engine.

`GET /api/slips/markets` returns a registry version and inspected provider capabilities. `GET/PATCH /api/account/settings` read and merge validated account UI preferences. `POST /api/account/saves/:publicId` accepts optional `title` and `isPublic`; requests without a body remain valid. Job/group responses add `outcome` with request ID, status, requested/generated/failed counts, and structured errors. Public-only metadata endpoints support server-rendered previews and sitemap generation.

Migration: `apps/api/prisma/migrations/202610220001_production_improvements/migration.sql` adds:

- `AppUser.uiSettings` JSON.
- Generation request keys, request IDs, payload hashes, requested counts, and structured failures.
- Collection completion/deletion timestamps and lifecycle scan indexes.
- Selection match phase and match-check timestamp, separate from settlement evidence.
- Two settlement-status indexes previously declared in Prisma but missing from the migration chain.

No application database was migrated during implementation. The full migration chain was applied successfully to a disposable local PostgreSQL database named `myodd_test`.

## Cache and deletion policy

Static market definitions ship with the versioned shared package. Dynamic capabilities use a 30-second query freshness window. Settings and collection queries use five-minute freshness with targeted mutation invalidation; account changes clear query data. Verified fully finished tickets use one-hour freshness and stop interval polling; explicit result checks invalidate them. Tickets with unresolved matches keep short freshness and polling. Provider fixture/event caches default to 30 seconds. Definitive missing-code responses use a 60-second negative cache. Interpretation cache keys include the application version, instruction/catalog hash, and learned defaults, with a five-minute TTL. Fresh booking validation bypasses those lookup caches.

The lifecycle worker runs every five minutes and processes bounded batches. Empty collections, unfinished jobs, live/pending/unknown selections, and missing completion evidence block deletion. A lost accumulator alone cannot start the clock. Final evidence must be refreshed before physical deletion; failures defer deletion. Transactional row locks coordinate cleanup with settlement writers. Collection-owned slips, selections, bookmarks, and jobs are removed; independent audit/training records remain. There is no backend collection-response cache to retain deleted collection contents.

`COLLECTION_CLEANUP_ENABLED` defaults to `false`. Lifecycle timestamps are still tracked. Enable physical deletion only after staging verification. Existing final collections receive a new full 24-hour window upon first verified completion after rollout. Ordinary user removal retains its existing reversible behavior until lifecycle cleanup physically removes the collection.

## Analytics configuration

Analytics is optional, production-only, and requires explicit user consent. The event helper accepts aggregate fields and substitutes generalized page paths; it excludes prompt text, betting codes, private route identifiers, and account identifiers. Revoking consent disables further tracking. No GA configuration or live event delivery was claimed during local testing.

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to the actual GA4 stream ID. Disable Enhanced Measurement for that stream, then set `NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED=true` and rebuild the web image. Google documents that history-based automatic page views can still fire despite `send_page_view:false` when Enhanced Measurement is enabled: [Google Analytics manual page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views). This release keeps analytics off until that external setting is confirmed.

## Validation and deployment

Commands for repeatable verification:

```sh
pnpm --filter @myodd/shared build
pnpm --filter @myodd/api lint
pnpm --filter @myodd/web lint
pnpm --filter @myodd/api test
pnpm --filter @myodd/api build
pnpm --filter @myodd/web build
cd apps/ai && .venv/bin/python -m unittest discover -s tests
```

The PostgreSQL integration suite runs only with `TEST_DATABASE_URL` pointing to a disposable database whose name is exactly `myodd_test`:

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/myodd_test pnpm --filter @myodd/api test -- test/production-database.test.ts
pnpm --filter @myodd/web exec playwright install chromium
pnpm --filter @myodd/web test:e2e
```

The browser suite exercises the real app with controlled provider responses, and the real save/settings/toast components in a separate test-only authentication harness. No fake-auth routes or fixture data are added to production. Hosted Clerk sign-in, real SportyBet booking creation, GA delivery, production traffic performance, and production deployment require separate environment validation.

Deploy additive migrations through the existing migration service before starting the new application. Rebuild API/web/shared and deploy the matching Python service. Preserve server secrets. Set `PUBLIC_WEB_URL` to the public HTTPS origin for canonical/sitemap URLs. Keep cleanup disabled for initial staging, exercise confirmed/pending/corrected settlements and physical cascades there, then enable it explicitly. For rollback, disable cleanup first, roll back application images, and retain the additive schema columns; do not attempt destructive migration rollback.

New configuration: `COLLECTION_CLEANUP_ENABLED`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED`. Existing SHA and public-origin configuration is reused. Final test results are recorded in the implementation handoff; no live-provider responses are manufactured.

## Verified locally (22 October 2026)

- Python: 100 tests passed.
- PostgreSQL: seven integration scenarios passed against a disposable PostgreSQL 16 database, including concurrent request deduplication, atomic guest claims, save visibility, settings updates, automatic private retention, physical cascades, and correction/outage deferral.
- The entire 14-migration chain applied successfully. A subsequent Prisma comparison reported no schema differences.
- Browser: 15 scenarios passed across all six requested viewport widths in both palettes; controlled provider/authentication fixtures are explicitly test-only. Ticket keyboard focus trapping/restoration was then added to the same browser flow and rechecked.
- Final API run: 257 tests passed. Seven PostgreSQL tests are intentionally skipped without TEST_DATABASE_URL and passed in their separate database run.
- API/shared/web type checks passed. Shared, API, and production Next.js builds passed.
- Final browser run: all 15 tests passed, including modal keyboard focus trapping/restoration. Mobile screenshots were inspected in both palettes.
- The disposable PostgreSQL container was removed after verification; no test database service was left running.

Known external validation: no real bookmaker bookings were created; hosted Clerk sign-in, real GA delivery, production-scale latency/Core Web Vitals, staging cleanup activation, and production deployment were not performed. Unsupported provider markets remain unavailable with an explanation. No production database was touched.

## Files created or modified

The inventory includes the pre-existing result-badge changes preserved in this release. Browser screenshots/traces and generated build outputs are ignored artifacts.

```text
.env.example
.gitignore
Dockerfile.node
apps/ai/app/tools/generation.py
apps/ai/app/tools/intent.py
apps/ai/app/odds_format.py
apps/ai/app/risk_modes.py
apps/ai/tests/test_draw_intent.py
apps/ai/tests/test_flexible_generation.py
apps/ai/tests/test_production_improvements.py
apps/ai/tests/test_splitting.py
apps/api/package.json
apps/api/prisma/migrations/202610220001_production_improvements/migration.sql
apps/api/prisma/schema.prisma
apps/api/src/ai/ai.client.ts
apps/api/src/auth/account.controller.ts
apps/api/src/bookmaker/sportybet.client.ts
apps/api/src/bookmaker/sportybet.provider.ts
apps/api/src/catalog/catalog.service.ts
apps/api/src/common/generation-error.ts
apps/api/src/common/http-exception.filter.ts
apps/api/src/groups/collection-cleanup.ts
apps/api/src/groups/collection-lifecycle.ts
apps/api/src/groups/group-access.ts
apps/api/src/groups/groups.controller.ts
apps/api/src/groups/groups.module.ts
apps/api/src/groups/groups.service.ts
apps/api/src/groups/play-check.service.ts
apps/api/src/jobs/create-booking.processor.ts
apps/api/src/jobs/jobs.controller.ts
apps/api/src/slips/slip-validator.service.ts
apps/api/src/slips/slips.controller.ts
apps/api/src/slips/slips.service.ts
apps/api/test/accounts.test.ts
apps/api/test/ai-client.test.ts
apps/api/test/booking-worker.test.ts
apps/api/test/catalog.test.ts
apps/api/test/code-lookup.test.ts
apps/api/test/generation-defaults.test.ts
apps/api/test/production-database.test.ts
apps/api/test/production-improvements.test.ts
apps/api/test/result-status.test.ts
apps/api/test/ticket-results.test.ts
apps/web/package.json
apps/web/playwright.config.ts
apps/web/src/app/code/[code]/page.tsx
apps/web/src/app/code/layout.tsx
apps/web/src/app/error.tsx
apps/web/src/app/g/[id]/layout.tsx
apps/web/src/app/generate/layout.tsx
apps/web/src/app/generate/page.tsx
apps/web/src/app/global-error.tsx
apps/web/src/app/globals.css
apps/web/src/app/history/layout.tsx
apps/web/src/app/history/page.tsx
apps/web/src/app/layout.tsx
apps/web/src/app/live/page.tsx
apps/web/src/app/page.tsx
apps/web/src/app/predictions/page.tsx
apps/web/src/app/privacy/page.tsx
apps/web/src/app/providers.tsx
apps/web/src/app/result/[id]/page.tsx
apps/web/src/app/result/layout.tsx
apps/web/src/app/robots.ts
apps/web/src/app/settings/layout.tsx
apps/web/src/app/settings/page.tsx
apps/web/src/app/sign-in/layout.tsx
apps/web/src/app/sign-up/layout.tsx
apps/web/src/app/sitemap.ts
apps/web/src/components/AccountSession.tsx
apps/web/src/components/Analytics.tsx
apps/web/src/components/AppHeader.tsx
apps/web/src/components/BackButton.tsx
apps/web/src/components/CodeWorkspace.tsx
apps/web/src/components/CollectionMenu.tsx
apps/web/src/components/CopyCode.tsx
apps/web/src/components/GameExplorer.tsx
apps/web/src/components/GenerateForm.tsx
apps/web/src/components/GenerationOutcome.tsx
apps/web/src/components/MarketPicker.tsx
apps/web/src/components/PublicCollectionCard.tsx
apps/web/src/components/PublicPreview.tsx
apps/web/src/components/ResponsibleFooter.tsx
apps/web/src/components/ResultBadge.tsx
apps/web/src/components/SaveCollection.tsx
apps/web/src/components/SettingsForm.tsx
apps/web/src/components/SettingsProvider.tsx
apps/web/src/components/SettingsSync.tsx
apps/web/src/components/SlipGroups.tsx
apps/web/src/components/ToastProvider.tsx
apps/web/src/hooks/useDialogFocus.ts
apps/web/src/lib/analytics.ts
apps/web/src/lib/api.ts
apps/web/src/lib/cache-policy.ts
apps/web/src/lib/generation-controls.ts
apps/web/src/lib/public-seo.ts
apps/web/src/lib/result-status.ts
apps/web/src/lib/ui-settings.ts
apps/web/tests/browser/flows.spec.ts
apps/web/tests/harness-server.cjs
apps/web/tests/harness.tsx
docker-compose.yml
docs/README.md
docs/features/collections.md
docs/features/generation.md
docs/features/production-improvements.md
docs/features/settings.md
docs/features/versioning.md
package.json
packages/shared/package.json
packages/shared/src/app-version.ts
packages/shared/src/generation-outcome.ts
packages/shared/src/index.ts
packages/shared/src/market-registry.ts
packages/shared/src/match-day.ts
packages/shared/src/mode-policy.ts
packages/shared/src/schemas.ts
packages/shared/src/ui-settings.ts
pnpm-lock.yaml
```
