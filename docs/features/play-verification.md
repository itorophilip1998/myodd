# Feature: Booking result tracking

The app tracks whether the saved selections in an unplaced standard accumulator
would win or lose. A booking code is sufficient when its selections have already
been saved and SportyBet exposes explicit settlement data. No bet is placed.

## Separate completion from results

`playStatus` describes match progress: upcoming/open, live, played/all played, or
unknown. A completed match does not establish that its selection won.

Tickets and selections have a separate `result`:

| Result | Meaning |
|--------|---------|
| `WON` | Every selection is won or void, with at least one win |
| `LOST` | At least one selection has an explicit loss |
| `VOID` | Every selection is explicitly void |
| `PENDING` | No loss or unknown evidence; at least one selection is pending |
| `UNKNOWN` | No confirmed loss, but some results are missing or conflicting |

An empty ticket is unknown. These rules apply to standard accumulators; partial
wins/losses, dead heats, cashout, promotions and payout calculations are unsupported.

## Evidence and matching

- Generation already checks the accepted booking against requested selections and
  stores event, market, outcome, specifier/line, teams, labels, odds and kickoff.
  The `BOOKING_SAVED` training event preserves the confirmation snapshot.
- Checks fetch share booking JSON fresh, independent of catalog expiry. Available
  and unavailable outcomes are matched by event + market + outcome + exact specifier.
- Explicit checks also bypass the event cache. A collection check fetches each
  distinct event once and shares that response across its tickets. Explicit match
  phases from a booking remain usable when the standalone event feed is missing;
  a finished phase establishes completion only, not a win or loss.
- Unresolved selections may use structured embedded JSON from the share page.
  Checks bypass the page cache. Free-text badges and loose HTML regex matches
  cannot establish results. Line-specific selections never fall back to an empty line.
- Bookmaker settlement uses explicit labels in `settleStatus`, `outcomeStatus`,
  `selectionStatus` or `result`. Numeric codes, generic `status`, ambiguous
  prose and unsupported settlement labels remain unknown. The independent BBC
  fallback can calculate supported standard-market results as described below.
- Conflicting final fields/duplicate rows produce unknown, including contradictions
  between fetched JSON and page results. A clear later result can correct a prior result.
- Each leg stores `resultSource`, `resultCheckedAt` and `resultEvidence`. Confirmed
  evidence survives a missing feed without advancing its evidence timestamp.
- Selection and ticket updates plus a `SETTLEMENT_CHECKED` audit event are committed
  in one transaction. The audit includes the fetched booking, parsed page results,
  and any independent match evidence used.
- Elapsed kickoff time, expired codes, removed selections and `isActive: false`
  cannot establish wins/losses or prove that matches finished.

## API and UI

`POST /api/codes/:code/check-play` and
`POST /api/groups/:groupId/check-play` return and persist `result` alongside
`playStatus`. Existing access rules apply: these operate on stored generated
bookings. The verify endpoints also run the checker.

Saved codes includes a separate **Check a code** form, independent of the filter
for loaded collections. `POST /api/checks/lookup` accepts an `identifier`: a ticket
ID, booking code, collection public/internal ID, or original booking code. It
checks the matching saved ticket or collection and returns a summary and details
link. Booking codes are case insensitive; database/public IDs retain their case.
Original booking codes resolve to the latest accessible saved collection when no
generated ticket matches. Private collections require their owner's session;
anonymous lookups search saved public collections only. Unknown identifiers and
inaccessible records return the same not-found response.

Direct code reads and checks filter inaccessible duplicate booking codes before
selecting the latest matching record. Summaries distinguish unconfirmed checks
from open/live tickets, and a checked collection with unknown play status displays
**Not confirmed** instead of **Unchecked**.

Code/group GET responses expose ticket and leg results and per-leg source/check
timestamps. Ticket cards show Win, Loss, Void or Pending when available; unknown
result badges remain in pick dialogs and code details. The Check result action
refreshes the evidence.

`cutLegs` counts confirmed losses. `playedLegs` already includes those finished
legs; summary completion totals must not add them a second time.

## Automatic checks

The BullMQ `ticket-settlement` queue schedules checks every five minutes, up to 25
eligible tickets per batch, ordered by oldest check first. Tickets become eligible
at kickoff (or immediately if kickoff is unknown). Deleted collections are excluded;
catalog expiry does not prevent checks. Unresolved tickets stay eligible and final
results are rechecked until seven days after the latest kickoff to capture corrections.
Queue backlog/provider latency can delay updates beyond five minutes.

## Deployment and limits

Apply `202610191200_ticket_results` with the normal Prisma deployment workflow
before starting the updated API, then regenerate Prisma Client/build the app.
Existing records start with unknown results and acquire evidence on their next check.
No legacy `PLAYED`/`CUT` row is automatically treated as a verified win/loss.

### Public BBC Sport scraper (enabled by default)

The checker fetches the public BBC Sport football results page for the saved
kickoff's **Europe/London calendar date**, for example
https://www.bbc.co.uk/sport/football/scores-fixtures/2026-10-20 . It extracts the
JSON string assigned to `window.__INITIAL_DATA__`, parses it without executing any
JavaScript, and validates the football/date block and event shapes with Zod.
Plain match prose and unrelated script objects are never used as evidence.
No browser installation, API key, or paid results account is required.
Set `BBC_RESULTS_ENABLED=false` on the API to disable it.

Matching requires home and away names in the correct order, kickoff within one
minute, and the saved league when present. Names normalize only case, accents and
punctuation; team words and age/gender/reserve markers remain intact. Duplicate,
ambiguous, wrong-league and different-kickoff candidates remain unconfirmed.
Coverage and team-name differences can prevent a match from being found.

Explicit `PostEvent` with FT/AET/PENS establishes completion. Calculated selection
results require **both regulation-time scores** from `runningScores.fulltime`.
The display score, extra-time score, penalties, or `scoreUnconfirmed` never stand
in for the regulation score. These saved SportyBet market/outcome IDs are supported:

| Market | Supported outcomes/lines |
|--------|--------------------------|
| 1, full-time result | 1 home, 2 draw, 3 away |
| 10, double chance | 9 home/draw, 10 home/away, 11 draw/away |
| 29, both teams to score | 74 yes, 76 no |
| 18, total goals | 12 over, 13 under; exact `total=N.5` specifier only |

Additional specifiers, whole/quarter-goal lines, first-half, corners, cards,
handicaps and player markets remain unconfirmed. Neither cancellation nor
abandonment implies a void bet. Contradictory current match phases prevent score
calculation, and conflicting bookmaker evidence is never overridden. Prior
confirmed bookmaker results retain priority; fresh BBC evidence may correct a
previous BBC calculation.

Derived results use `BBC_SPORT_SCORE`, with provider event ID, source URL, match
status, regulation score and timestamp in the stored evidence/audit. The result
badge tooltip identifies BBC score calculations. Date requests are coalesced and
cached for 60 seconds, with the same cooldown after failures. Source blocks,
timeouts, malformed pages and unsupported matches return unknown, never guessed
wins or losses. Sofascore returned 403 during implementation, so this scraper
uses the accessible BBC page instead.

### Optional API-Football match-progress fallback

An optional independent **match-progress** fallback uses API-Football/API-Sports.
Set `API_FOOTBALL_KEY` as a server-only secret, then restart/redeploy the API.
Create an account at https://dashboard.api-football.com/register and choose access
covering the matches and seasons you need. No provider account is created by this
integration. Without a key, this optional fallback makes no requests; SportyBet
and BBC checks still run. Never expose this key through `NEXT_PUBLIC_*` variables.

When SportyBet cannot establish a match phase, the fallback queries fixtures for
the stored kickoff's UTC date. It requires a unique match with the same home and
away team names (case, accents and punctuation normalized) and kickoff within one
minute. Team words, youth/reserve/women markers and home/away order are preserved;
ambiguous matches and name variations remain unconfirmed. FT/AET/PEN establish
completion; live phases establish in-play status; postponement, cancellation and
abandonment never imply completion or a void bet. Displayed notes identify the
source, and the audit records the provider fixture ID, phase, score and timestamp.
Date requests are coalesced and cached for 60 seconds; failed lookups also have a
60-second cooldown. Provider access, coverage and quotas can limit availability.
Provider reference: https://www.api-football.com/documentation-v3 .

This API-Football fallback confirms match progress only. If SportyBet omits
settlement and the BBC score evaluator does not support or find the selection,
its result remains unconfirmed even if the match is confirmed finished. A final
score alone is insufficient for markets
such as first-half goals, cards, player statistics or Asian handicaps. Only a
validated provider-specific mapping/evaluator should extend supported evidence.
