# Codes and generation controls — v0.2.17

Branch: `bug/0.2.17-codes-generation-controls`.

## Layout and selection

Grid and Compact collection layouts now show at most four columns. List remains a single column. Individual ticket grids show at most five columns; existing collections are not truncated. Both grids reduce their column counts on smaller screens, with separate rules for collections and tickets.

Collection checking moved from the card surface into its Actions dropdown as **Check results**. The library no longer offers an unselected Verify played operation. In selection mode, Check results and Delete selected appear only after at least one owned collection is selected. Bulk checking uses exactly the selected IDs. Checking preserves selection; deletion confirms first and retains Undo. Public/non-owned collections cannot be selected through the owned-collection controls. The separate booking-code lookup remains available.

## Generation limits and presentation

The output limit is ten tickets, including split parts. Frontend controls, shared request/configuration schemas, NestJS preparation, Python configuration/input models, intent parsing, and model instructions use this limit. Numeric and written counts above ten are rejected before job creation/provider booking work, with **You can generate up to 10 tickets at a time.** The user's input stays available for correction. Games per ticket and pinned-selection limits remain fifty.

Legacy local, account, pending-sync, and learned output defaults are normalized to ten without reducing remembered game counts. Existing saved collections and historical outcome counts remain accessible. No database migration is needed.

Pending/running jobs show progress rather than terminal empty/error summaries. Completed requests display one concise result message. Raw provider, fixture, search-budget, and diversification diagnostics stay in the existing API/job/report records for troubleshooting; result and collection pages no longer echo them into banners or toasts. Empty eligible pools show **No eligible matches were available for this request. Try another match day or adjust your options.** with one Adjust request action. Partial successes preserve available tickets, and uncertain booking confirmations retain a concise caution. Refetch failures preserve loaded tickets and offer inline retry. Initial submission failures remain inline after their notification expires.

## Notifications

Ordinary notifications expire after five seconds. Existing sticky/error calls and Undo/action calls expire after eight seconds. Custom durations are bounded to 2.5–10 seconds. The callable toast API remains compatible, but no notification stays indefinitely.

Hover or keyboard focus pauses the remaining duration; leaving resumes it. Removal, dismissal, list eviction, and provider unmount clean up timers. Manual close and Dismiss all remain available.

## Verification and rollout

- Shared build, API/web type checks, API/web production builds.
- API: 260 tests passed; seven optional PostgreSQL integration tests skipped because no disposable test database was configured.
- Python: 104 tests passed, including numeric/written count rejection, split limits, legacy defaults, and preserving fifty-game support.
- Browser: 25 distinct tests passed across a full 24-case run and a subsequent four-case targeted run including the additional ten-ticket layout case. Checks include the six planned viewport widths, selected-ID checking/deletion, deletion cancellation and Undo, finite toast timing with controlled clocks, progress/empty result transitions, and input preservation on rejection.
- The five-column ticket grid was visually inspected with ten tickets. Browser provider responses use controlled fixtures; no live bookings were created.

No new environment variable or migration is required. Before deploying stricter workers, allow any previously queued requests for more than ten outputs to finish under the existing worker version; then roll out the shared/API/AI/web updates together. Application deployment is a separate step; these changes do not deploy the services.
