# SEO, indexing, and analytics — v0.2.22

MyOdd retains the homepage generator, anonymous public browsing, and local guest settings. SEO extends the existing Next.js App Router architecture; generation and account ownership policies remain in the existing API.

## Public content and indexing policy

The homepage includes server-rendered product explanations, supported-market information, a workflow, collection/result guidance, FAQs, and responsible-gambling content. `/about` and `/faq` provide durable information and are linked from the footer. Public pages have one H1, descriptive internal links, canonical metadata, Open Graph, and Twitter cards. Organization, WebSite, and SoftwareApplication JSON-LD describe the actual service without fabricated ratings, reviews, or offers. The `/opengraph-image` PNG is generated locally from the existing icon, at 1200 × 630.

`/sitemap.xml` contains only `/`, `/about`, `/faq`, `/terms`, and `/privacy`. It does not call the API or include collections. No unsupported modification timestamps are generated. Existing API sitemap endpoints remain compatible but are no longer used by the website sitemap.

`/generate`, `/predictions`, `/history`, `/settings`, authentication pages, individual codes/results, and temporary collections are `noindex`. Public collections retain canonical/social metadata for sharing. `robots.txt` allows public crawling so search engines can read `noindex`, disallows unnecessary `/api/` crawling, and advertises the canonical sitemap. Authentication and API ownership checks enforce privacy independently of robots rules.

Canonical origin comes from `PUBLIC_WEB_URL`. With no setting, production uses `https://myodd.org` and development uses `http://localhost:3000`. Configure the real production origin explicitly. Invalid protocols fail instead of publishing invalid canonicals. Caddy already redirects `www` to the apex domain.

Collection server rendering first checks public metadata. For collections without public metadata, the existing API policy determines access using a verified server-side Clerk token when available, retaining owner access and unowned drafts. Missing/inaccessible/deleted collections return 404. Upstream failures remain server errors rather than pretending the collection was deleted. No private collection title is included in metadata.

## Clerk findings and deployment audit

- Local `apps/web/.env.local` had development publishable and secret keys. Key values were not printed or changed.
- A read-only host audit using `pnpm dlx clerk@latest doctor --json` (CLI 4.0.0) authenticated successfully and identified the linked MyOdd application. It reports a development instance and **production not configured**. The CLI also warns about missing root `.env` Clerk variables; Compose intentionally loads keys from `apps/web/.env.local`, so that warning alone does not mean the app lacks credentials. Live website checks were unavailable through the web tool, and the sandbox could not resolve the production host. A second read-only check, `pnpm dlx clerk@latest deploy status --mode agent`, returned `state: not_started`, `productionInstanceId: null`, and `domain: null`. Deployed server credentials and live redirects remain **unverified**.
- Middleware initializes Clerk but does not blanket-protect public routes. The root session boundary previously replaced all content with a loading indicator; it now renders public content immediately.
- Browser API requests wait until Clerk resolves identity. Guest requests then proceed anonymously, while signed-in requests require a token. Missing tokens never downgrade signed-in requests to anonymous requests.
- Existing signed-in guards protect account APIs and the personal collection listing. Existing ownership checks protect private reads and mutations. Guest settings remain local, and public Codes browsing remains available.
- Compose supplies web and API Clerk keys from the server's `apps/web/.env.local`. Deployment preserves that file and `.env`; it does not merge example values into the server configuration.

Before deploying, inspect key **types**, not values, on the production host:

```sh
docker compose exec -T web node -e 'const mode=v=>!v?"unset":v.startsWith("pk_live_")||v.startsWith("sk_live_")?"production":v.startsWith("pk_test_")||v.startsWith("sk_test_")?"development":"unrecognized"; console.log({publishable:mode(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),secret:mode(process.env.CLERK_SECRET_KEY),origin:process.env.PUBLIC_WEB_URL});'
```

Verify both services use matching credentials from the intended production instance, the Clerk domain is configured, sign-in/sign-up URLs point to MyOdd, and `CLERK_AUTHORIZED_PARTIES` permits `https://myodd.org`. A development `accounts.dev` account portal is not proof that public middleware itself requires authentication.

Do not replace keys blindly: Clerk development and production instances have separate user records. Existing application ownership uses verified Clerk identifiers. Any necessary identity transition requires an owner-reviewed preservation/mapping strategy before switching credentials; this release does not migrate accounts or modify keys. Once that strategy is agreed, the owner can run `pnpm dlx clerk@latest deploy` in a human terminal to configure production and then use `deploy status` to verify DNS/SSL/OAuth readiness. The CLI reports that production setup requires an interactive human terminal.

## Google Search Console

The owner-provided verification token is:

```text
c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM
```

It is public verification data. The trailing period in the supplied sentence is excluded. The application renders it as `google-site-verification` metadata by default. `GOOGLE_SITE_VERIFICATION` optionally overrides it at runtime and is wired through Compose.

1. For a **Domain** property, create `myodd.org` in Search Console and add the exact TXT record Google specifies at the DNS provider:

   ```text
   google-site-verification=c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM
   ```

   Use the host/name and token shown by the selected property; confirm this supplied token matches that property. HTML metadata cannot verify a Domain property.
2. For a **URL-prefix** property, use `https://myodd.org/`, choose HTML-tag verification, and confirm the token matches the deployed page's meta tag.
3. Deploy, confirm anonymous 200 responses for public pages, verify ownership, and submit `https://myodd.org/sitemap.xml`.
4. Inspect the homepage using the live URL test, confirm its canonical and rendered content, and request indexing if appropriate.
5. Review Page Indexing, Sitemaps, Core Web Vitals, and Search Performance. Temporary collection/utility exclusions are intentional. Investigate unexpected errors or canonical mismatches.

No Google Indexing API submission, Search Console verification, sitemap submission, or indexing success is claimed. See [Google's Search Console guide](https://developers.google.com/search/docs/monitor-debug/search-console-start).

## GA4 activation and privacy

Required production configuration:

```dotenv
PUBLIC_WEB_URL=https://myodd.org
GOOGLE_SITE_VERIFICATION=c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-REPLACE_WITH_REAL_STREAM_ID
NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED=false
```

The sample measurement ID is a placeholder, not a configured property. Leave the measurement ID empty until the stream exists. Both `NEXT_PUBLIC_GA_*` variables are **build-time** values passed through Compose and the Dockerfile; updating them requires rebuilding the web image. Clerk keys are separate runtime settings and must never be committed.

1. Create a GA4 property and web stream for `https://myodd.org` in the owner's Google Analytics account.
2. Disable Enhanced Measurement for the stream. Automatic history tracking can duplicate manually tracked page views even when `send_page_view:false` is set. See [Google's manual page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views).
3. Set the real stream ID and `NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED=true` on the server, then rebuild/deploy.
4. Accept optional analytics in a production browser. In browser network tools and GA4 Realtime/DebugView, verify one page view per pathname navigation and inspect payloads for privacy. Use Google's debugging tools for the explicit validation session; do not leave global debug reporting enabled.
5. Reject or withdraw analytics consent and confirm further collection stops. Check another tab and a fresh page load.
6. Mark `generate_completed` and `collection_saved` as key events in GA4.

The application uses basic Consent Mode v2. Google scripts are not requested before opt-in; analytics consent is granted only after acceptance. Ad storage, ad user data, and ad personalization stay denied. Accept/reject choices persist in local storage, synchronize between tabs, and remain editable in the footer. Revocation updates consent and disables the tag; previous collected data is not retroactively erased. Storage failures fail closed. Script loading failures do not break the product.

Analytics is disabled in development, without a valid stream ID, or without manual-events confirmation. No GTM container or second GA installation is added. GA4 may use pseudonymous cookies and browser/device/location signals; the privacy policy explains this and avoids claiming all processing is anonymous.

Events use a typed helper and runtime allowlists. Numeric counts are finite, nonnegative bounded integers. URLs use fixed route categories, omitting query strings, fragments, prompts, booking codes, account identifiers, and private collection/result IDs. Deduplication keys stay in browser session storage and are never event parameters. Successful authentication is counted only after an explicit signed-out auth attempt creates a new session; restored sessions are not logins. User creation during that attempt distinguishes registration. Auth events are not replayed after a later consent grant.

On a public entry page after consent, traffic attribution uses only the external referrer **origin** and these approved campaign labels:

- Sources: google, bing, facebook, instagram, twitter, x, linkedin, whatsapp, telegram, youtube, tiktok, newsletter.
- Media: organic, cpc, ppc, paid_social, social, email, referral, display, affiliate.
- Campaigns: launch, organic, social, newsletter, referral.

Unknown labels are dropped; expand the explicit allowlist for future reviewed campaigns. Public entry pages are the durable sitemap pages. Private and utility entry URLs do not contribute referrer/campaign values. Attribution is intentionally less detailed than unfiltered GA tracking.

### Event contract and reports

| Event | Trigger and allowed values |
| --- | --- |
| `page_view` | Initial consented view or pathname change; generalized `page_path` |
| `sign_up`, `login` | New session after an explicit authentication flow; no identifiers |
| `generate_started` | Generation submitted |
| `generate_completed`, `generate_failed` | Terminal generation, deduplicated per request; requested/generated/failed counts; failed submission is also measured |
| `code_copied` | Successful code/ticket copy; optional aggregate count |
| `collection_saved` | Successful explicit save |
| `collection_published` | Successful publication |
| `collection_deleted` | Successful removal; optional aggregate count |
| `market_selected` | A market is added; aggregate selected count |
| `result_check_started` | Explicit result-check API operation, including lookup and bulk individual requests |
| `result_check_completed` | Check operation settles; count=1/failed=0 on success or count=0/failed=1 on failure |
| `share_clicked` | User invokes a ticket or collection share action; cancellation still counts as a click |

Automatic authenticated generation persistence does not count as an explicit collection save. Partial generation with at least one successful ticket is a completion; failed count retains shortages/errors. Repeated observation of the same terminal request does not create another completion.

Use GA4 reports for daily/monthly active users, new/returning visitors, user/traffic acquisition, landing pages, country, and device. In Explore, build generation-start → generation-completion and completion → explicit-save funnels. Compare generation-failure/start event counts, generated/failed ticket totals, result-check success/failure counts, and copy/share engagement. Ratios of event counts describe actions, while GA4 funnels describe users; retries and bulk checks can create multiple actions per user. Configure count parameters as event-scoped custom metrics where useful. Consented visits are a subset of total traffic.

## Repeatable validation

```sh
pnpm --filter @myodd/shared build
pnpm --filter @myodd/web lint
pnpm --filter @myodd/web build
pnpm --filter @myodd/web test:seo:production
pnpm --filter @myodd/web test:analytics
pnpm --filter @myodd/web test:session
PLAYWRIGHT_CHANNEL=chrome pnpm --filter @myodd/web test:e2e
pnpm --filter @myodd/api test
```

`PLAYWRIGHT_CHANNEL=chrome` uses installed Chrome when the Playwright Chromium download is unavailable. Omit it to use Playwright's default browser. Browser tests use controlled providers and do not create real betting tickets. Analytics tests intercept Google script requests and do not demonstrate live GA delivery. Session tests exercise the actual public boundary with controlled Clerk hooks rather than contacting the Clerk service.

After deployment, use Google Rich Results Test to inspect the rendered JSON-LD and Search Console live inspection to check Googlebot rendering. These are separate from local JSON/schema checks; Organization and WebSite markup alone do not promise rich-result eligibility.

Local lab results cannot establish field Core Web Vitals, production Clerk behavior, Google indexing, or live analytics collection.

## Executed validation — 26 October 2026

| Check | Actual result |
| --- | --- |
| Shared TypeScript build | Passed |
| Web TypeScript check | Passed; final production build also checked types |
| Final optimized web build | Passed on Next.js 15.5.27 |
| Full Chrome browser suite | 44 passed, including five new SEO tests |
| Focused final session test | Passed: content visible during Clerk loading, direct calls and React Query wait for identity, guest/authenticated requests use correct tokens, active queries refetch on sign-in/sign-out, and missing signed-in tokens are rejected |
| Production-like analytics suite | Passed: consent/persistence/revocation across tabs, StrictMode and navigation deduplication, runtime payload sanitization, completed authentication outcomes, minimized attribution, script failure, development and missing-ID isolation; all Google requests intercepted |
| Local production-server SEO test | Passed: server-rendered pages with JS disabled, one H1, verification tag, canonical origin, JSON-LD, noindex, private/missing collection 404 versus upstream 500, sitemap/robots, 1200 × 630 PNG, and mobile overflow |
| API regression suite | 272 passed, 7 skipped across 23 passing test files and one skipped file; database-dependent tests were not run against a disposable database |
| Diff whitespace check | Passed |
| Clerk host doctor | Authenticated and linked; development instance exists, production is not configured |
| Clerk deployment status | `complete: false`, `state: not_started`, production instance/domain null |

The first browser attempt could not use the absent default Playwright browser. With installed Chrome, an intermediate run passed 42/44: one viewport navigation was interrupted by a source-edit reload, and the root-canonical assertion expected a slash Next.js normalizes away. The corrected full run passed 44/44. The final cache-lifecycle adjustment was then verified with focused session/React Query tests and the fresh production build/test.

One unthrottled localhost mobile lab run measured LCP at **536 ms** and cumulative layout shift at **0.00195**. These are observations from a local fixture-backed production build, not field Core Web Vitals or evidence of production speed. INP was not measured. Existing mobile regression checks cover widths from 320 to 1280 pixels. Both the mobile homepage screenshot and the generated social image were visually inspected.

## Remaining owner actions

- Review the account-preservation strategy before provisioning/switching to Clerk production. Production deployment status currently says setup has not started; deployed server keys and live redirect behavior remain unverified.
- Create the GA4 property/stream and provide the real measurement ID. Disable Enhanced Measurement, confirm manual events, rebuild, and verify real events after consent.
- Verify Search Console using the matching DNS TXT or HTML-token method, then submit the sitemap and inspect canonical/indexing status.
- Deploy through the normal development → production flow. The branch is `bug/0.2.22-seo-indexing-analytics`; root/workspace versions and shared `APP_VERSION` are `0.2.22`.
- Validate live structured data with Google's tools and monitor real Core Web Vitals after deployment. No deployment, indexing, Search Console verification, or production analytics delivery was performed or claimed.


## Implementation file inventory

Includes the earlier implementation checkpoint and the remaining working-tree changes. `PLAN.md` was supplied separately and is not an implementation edit. The duplicate `apps/web/src/app/favicon.ico` was removed; `public/favicon.ico` remains the single asset for that URL.

```text
.env.example
.env.production.example
apps/api/package.json
apps/web/package.json
apps/web/playwright.config.ts
apps/web/src/app/about/page.tsx
apps/web/src/app/code/layout.tsx
apps/web/src/app/faq/page.tsx
apps/web/src/app/favicon.ico
apps/web/src/app/g/[id]/layout.tsx
apps/web/src/app/generate/layout.tsx
apps/web/src/app/generate/page.tsx
apps/web/src/app/globals.css
apps/web/src/app/history/layout.tsx
apps/web/src/app/layout.tsx
apps/web/src/app/opengraph-image.tsx
apps/web/src/app/page.tsx
apps/web/src/app/predictions/page.tsx
apps/web/src/app/privacy/page.tsx
apps/web/src/app/result/layout.tsx
apps/web/src/app/robots.ts
apps/web/src/app/settings/layout.tsx
apps/web/src/app/sign-in/[[...sign-in]]/page.tsx
apps/web/src/app/sign-in/layout.tsx
apps/web/src/app/sign-up/[[...sign-up]]/page.tsx
apps/web/src/app/sign-up/layout.tsx
apps/web/src/app/sitemap.ts
apps/web/src/app/terms/page.tsx
apps/web/src/components/AccountSession.tsx
apps/web/src/components/Analytics.tsx
apps/web/src/components/AuthFlowAnalytics.tsx
apps/web/src/components/GenerateWorkspace.tsx
apps/web/src/components/GenerationOutcome.tsx
apps/web/src/components/ResponsibleFooter.tsx
apps/web/src/components/SeoContent.tsx
apps/web/src/components/ShareButtons.tsx
apps/web/src/components/SlipGroups.tsx
apps/web/src/lib/analytics.ts
apps/web/src/lib/api-auth.ts
apps/web/src/lib/api.ts
apps/web/src/lib/auth-analytics.ts
apps/web/src/lib/public-seo.ts
apps/web/tests/analytics-smoke.cjs
apps/web/tests/browser/seo.spec.ts
apps/web/tests/harness-server.cjs
apps/web/tests/harness.tsx
apps/web/tests/seo-production.cjs
apps/web/tests/session-smoke.cjs
docker-compose.yml
docs/features/seo-indexing-analytics.md
package.json
packages/shared/package.json
packages/shared/src/app-version.ts
```
