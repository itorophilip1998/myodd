# Generation recovery — v0.2.18

Branch: `bug/0.2.18-generation-recovery`.

## Confirmed causes

Read-only inspection of the running local services found connection resets/refused connections while the API restarted. Result polling stopped after failures and displayed a large refresh error panel.

Recent failed requests had no explicit booking code or pinned picks, but inherited an original-only instruction from saved UI settings. The API selected an automatic catalog source, and all fifty original matches lacked eligible pre-match markets. The resulting candidate pool was empty. This diagnosis used local job records and source-request metadata; no booking was created to reproduce it.

## Changes

- Fresh prompt generation reads upcoming fixtures without selecting an implicit catalog master. It uses upcoming mode with no original selections to preserve. Explicit source codes and pinned picks retain their original-selection behavior, fresh validation, and hard constraints.
- Hidden original-only preferences are not appended to fresh requests without a source. Explicit original-only/split instructions without a source are rejected before creating a job, with a guided source-code message. Typed application error codes survive the HTTP error boundary.
- Result and saved-collection reads retry temporary failures with bounded backoff, retaining loaded tickets. Reconnection status replaces the large refresh failure panel. Only safe reads repeat; generation and booking creation are never resubmitted by recovery.
- Either job endpoint or embedded collection progress can provide the latest job status. A missing job endpoint does not hide a valid completed collection. Collection reads continue if terminal job progress arrives before persisted tickets become visible.
- Unauthorized, deleted, and invalid-link responses stop automatic retries and preserve access restrictions. Missing authenticated sessions use a typed authorization error.
- Optional availability-refresh failures no longer prevent reading stored collections/tickets. Availability is reported as unknown, with a server warning, rather than claimed active.
- Previously failed jobs and bookings remain unchanged. Genuine provider/constraint failures remain honestly reported; these changes do not guarantee that every request can be booked or relax explicit constraints.

## Verification and local application

- Shared build and API/web type checks passed. Both Docker production builds passed.
- API: 267 tests passed; seven optional PostgreSQL integration tests skipped without a disposable test database. Targeted tests also verified persisted tickets remain readable during an availability dependency failure.
- Browser: 30 distinct tests passed across the full 29-case run and a final five-case recovery run. Tests cover automatic reconnection without another generation POST, redundant job endpoint failure, delayed ticket reads, hidden source defaults, and saved-collection recovery.
- A read-only live catalog request returned HTTP 200 with active market options. This verifies catalog access, not booking creation. No live bookings were created by verification.
- Built the final API/web images, confirmed there were zero pending/running generation jobs, then applied them locally with `docker compose up -d --no-deps --wait api web`. API/web and their existing dependencies were healthy afterward. API package version and rendered web footer both verified v0.2.18.
- No migration or new environment variable is required. No failed jobs were replayed. Remote application deployment is separate from these changes.
