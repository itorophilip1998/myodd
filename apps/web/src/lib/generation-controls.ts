import { modeKeyFromLabel, previewOddsFromPrompt } from '@myodd/shared';

/** Explicit prompt controls, used to keep the form in sync with the latest user edit. */
export function readGenerationControls(text: string) {
  const tickets = [...text.matchAll(/\b(\d+)\s+(?:tickets?|codes?|slips?|bookings?)\b/gi)].at(-1);
  const gameMatches = [
    /\b(?:exactly|make(?:\s+it)?)\s+(\d+)\s+(?:games?|matches?|legs?|picks?|selections?)\b/gi,
    /\b(\d+)\s+(?:games?|matches?|legs?|picks?|selections?)\s+(?:per\s+(?:ticket|slip|code)|each)\b/gi,
    /\b(?:with|using)\s+(\d+)\s+(?:games?|matches?|legs?|picks?|selections?)\b/gi,
  ].flatMap(pattern => [...text.matchAll(pattern)]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const mode = [...text.matchAll(/\b(?:Investor|Gamblers?|Gamlers?|Japa|Lagos[ -]*(?:life|lifes|lives))\s+modes?\b/gi)].at(-1);
  return { tickets: tickets ? Number(tickets[1]) : null,
    games: gameMatches.length ? Number(gameMatches.at(-1)![1]) : null,
    mode: mode ? modeKeyFromLabel(mode[0]) : null, odds: previewOddsFromPrompt(text) };
}
