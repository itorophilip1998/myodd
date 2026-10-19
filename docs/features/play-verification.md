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
- Unresolved selections may use structured embedded JSON from the share page.
  Checks bypass the page cache. Free-text badges and loose HTML regex matches
  cannot establish results. Line-specific selections never fall back to an empty line.
- Only explicit settlement labels in `settleStatus`, `outcomeStatus`,
  `selectionStatus` or `result` are used. Numeric codes, generic `status`, ambiguous
  prose and unsupported settlement labels remain unknown.
- Conflicting final fields/duplicate rows produce unknown, including contradictions
  between fetched JSON and page results. A clear later result can correct a prior result.
- Each leg stores `resultSource`, `resultCheckedAt` and `resultEvidence`. Confirmed
  evidence survives a missing feed without advancing its evidence timestamp.
- Selection and ticket updates plus a `SETTLEMENT_CHECKED` audit event are committed
  in one transaction. The audit includes the fetched booking and parsed page results.
- Elapsed kickoff time, expired codes, removed selections and `isActive: false`
  cannot establish wins/losses or prove that matches finished.

## API and UI

`POST /api/codes/:code/check-play` and
`POST /api/groups/:groupId/check-play` return and persist `result` alongside
`playStatus`. Existing access rules apply: these operate on stored generated
bookings. The verify endpoints also run the checker.

Code/group GET responses expose ticket and leg results and per-leg source/check
timestamps. Ticket cards, pick dialogs and code details show Win, Loss, Void,
Pending or Awaiting confirmation. The Check result action refreshes the evidence.

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

This implementation does not add an independent historical results provider.
If SportyBet omits settlement or stops exposing an old booking, missing results
remain Awaiting confirmation. A final score alone is insufficient for markets
such as first-half goals, cards, player statistics or Asian handicaps. Only a
validated provider-specific mapping/evaluator should extend supported evidence.
