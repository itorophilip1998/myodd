import { MAX_TICKET_ODDS, MODE_ODDS, requestedTicketCount, previewOddsFromPrompt, type ModeKey } from '@myodd/shared';
import { MAX_GAMES_PER_TICKET, MAX_TICKETS } from './ui-settings';

/** Pre-flight checks that should toast and abort before a generate job starts. */
export function generateGuardrailMessage(input: {
  wantsSplit: boolean;
  instruction: string;
  ticketCount?: number;
  gamesPerTicket?: number;
  mode?: ModeKey;
  splitParts?: number;
  /** Raw (pre-clamp) manual odds from options. */
  rawMinOdds?: number | null;
  rawMaxOdds?: number | null;
  oddsSource: 'manual' | 'prompt';
}): string | null {
  const { wantsSplit, instruction, ticketCount, splitParts, rawMinOdds, rawMaxOdds, oddsSource } = input;

  if ((requestedTicketCount(instruction) ?? 0) > MAX_TICKETS || (ticketCount ?? 0) > MAX_TICKETS || (splitParts ?? 0) > MAX_TICKETS) return 'You can generate up to 10 tickets at a time.';
  if (wantsSplit) {
    if (splitParts != null && (!Number.isInteger(splitParts) || splitParts < 1 || splitParts > MAX_TICKETS)) {
      return `Choose 1–${MAX_TICKETS} parts.`;
    }
    return null;
  }

  if (ticketCount != null && (!Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > MAX_TICKETS)) {
    return `Choose 1–${MAX_TICKETS} tickets.`;
  }

  if (input.gamesPerTicket != null && (!Number.isInteger(input.gamesPerTicket) || input.gamesPerTicket < 1 || input.gamesPerTicket > MAX_GAMES_PER_TICKET)) {
    return `Choose 1–${MAX_GAMES_PER_TICKET} games per ticket, or Random.`;
  }

  if (oddsSource === 'manual') {
    if (rawMinOdds == null || !Number.isFinite(rawMinOdds)) {
      return 'Enter a valid Min and Max odds range.';
    }
    if (rawMaxOdds != null && !Number.isFinite(rawMaxOdds)) {
      return 'Enter a valid Min and Max odds range.';
    }
    if (input.mode !== 'LAGOS_LIFE' && (rawMinOdds > MAX_TICKET_ODDS || (rawMaxOdds != null && rawMaxOdds > MAX_TICKET_ODDS))) {
      return `Ticket odds cannot exceed ${MAX_TICKET_ODDS}. Lower the odds before generating.`;
    }
    if (rawMaxOdds != null && rawMinOdds > rawMaxOdds) {
      return 'Minimum ticket odds cannot be higher than the maximum.';
    }
  } else {
    const fromPrompt = previewOddsFromPrompt(instruction);
    if (fromPrompt) {
      if (input.mode !== 'LAGOS_LIFE' && (fromPrompt.minimum > MAX_TICKET_ODDS || (fromPrompt.maximum != null && fromPrompt.maximum > MAX_TICKET_ODDS))) {
        return `Ticket odds cannot exceed ${MAX_TICKET_ODDS}. Lower the odds in your prompt before generating.`;
      }
    }
  }

  const gamesAsk = instruction.match(
    /\b(?:exactly\s+)?(\d{1,3})\s*(?:games?|legs?|picks?|selections?)\s*(?:per\s+ticket)?\b|\bmake\s+it\s+(\d{1,3})\s+games?\b/i,
  );
  const requested = oddsSource === 'manual' && rawMinOdds != null ? { minimum: rawMinOdds, maximum: rawMaxOdds } : previewOddsFromPrompt(instruction);
  const band = input.mode ? MODE_ODDS[input.mode] : null;
  if (requested && band && (requested.minimum < band.minimum || (band.maximum != null && requested.maximum != null && requested.maximum > band.maximum))) {
    return 'This odds range is outside the selected mode. Change the mode or the range before generating.';
  }
  if (gamesAsk) {
    const n = Number(gamesAsk[1] || gamesAsk[2]);
    if (Number.isFinite(n) && n > MAX_GAMES_PER_TICKET) {
      return `Games per ticket cannot exceed ${MAX_GAMES_PER_TICKET}.`;
    }
  }

  return null;
}

// Re-export for callers that only need the ceiling constant from web code.
export { MAX_TICKET_ODDS };
