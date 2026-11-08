# Generation UI polish (v0.2.20)

- Ticket requests above 10 are rejected before persistence and provider work, including Investor Mode. Games per ticket retain their separate 50-game ceiling.
- Markets use the bundled shared market registry. Opening or searching the picker makes no provider requests. Generation still resolves selected markets against actual fixtures and reports unavailable choices.
- Ready tickets hide the animated progress display while remaining booking tasks continue. Empty in-progress collections still show progress, and result polling continues until the job and persisted tickets catch up.
- Legal documents use a centered reading column with centered headings and document links. Footer legal links stay centered.
- The Live page, navigation entry, and sitemap entry are removed. Saved-ticket live settlement support and the provider API remain available.
- Saved collections retain at most four columns; tickets retain at most five columns, with fewer columns on smaller screens.
- Existing SEO includes canonical URLs, Open Graph metadata, robots directives, and the public sitemap. Existing GA4 integration requires `NEXT_PUBLIC_GA_MEASUREMENT_ID`, consent, and `NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED=true` after disabling Enhanced Measurement in the GA4 stream; see [production improvements](production-improvements.md). The ID is not configured in the local environment.

Validation: shared build, API/web TypeScript checks, API unit suite, and browser coverage for limits, instant market selection, loader visibility, legal alignment, removed Live route, and responsive card counts.

Verified results: 267 API tests passed, seven database integration tests skipped without a configured test database. All 34 browser scenarios passed across the full run and targeted reruns using installed Google Chrome. The targeted reruns resolved a cold-route navigation timeout and a transient development-refresh 404. Shared/API/web builds and API/web TypeScript checks passed. Visual review confirmed five ticket columns, centered legal content, and centered footer links. GA activation remains pending the actual measurement ID and stream configuration.

Analytics runtime check: `pnpm --filter @myodd/web test:analytics` bundles the actual Analytics component in production mode and runs it in installed Google Chrome against an isolated local server. It intercepts Google script requests, uses a test-only ID, and verifies consent gating, denial, revocation, sanitized private-route page views, aggregate events, and single script initialization. This check passes; real GA4 delivery remains unverified until the user's measurement ID and stream settings are provided.

## Lagoslife odds update

Lagoslife now starts at 100 combined odds and has no product maximum. Leave Max blank for an open-ended request, enter a custom numeric maximum such as 5000000, or type a prompt such as “from 100 to 5m odds”. The frontend preserves null maximums, expands compact odds, and omits the old 10000 ceiling instruction. Backend controls retain custom prompt ranges. Python mode rules use the same inclusive 100 floor and preserve open-ended targets. Mode cards, information popovers, and Terms reflect this behavior.

Validation: 269 API tests passed (seven database tests skipped), 110 Python tests passed, both TypeScript checks passed, and seven targeted browser scenarios passed, including custom 5m odds, unlimited odds, compact prompt submission, and mode information.
