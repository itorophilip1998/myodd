/** Conservative extraction shared by chat UI and API; never treats ordinary prose as a code. */
export function readChatRequest(instruction: string) {
  const ignored = new Set(['CREATE', 'HIGHER', 'MEDIUM', 'SPORTY', 'SPLITS', 'PLEASE', 'INVESTOR', 'GAMBLER', 'LAGOS', 'THIS', 'THAT', 'INTO', 'CODE', 'CODES', 'IT', 'MY', 'THE', 'BETWEEN', 'USING', 'ORIGINAL']);
  const valid = (code: string) => !ignored.has(code.toUpperCase());
  const marked = [...instruction.matchAll(/(?:@|\bcode\s*:\s*|[?&](?:shareCode|customCode)=)([a-zA-Z0-9_]{3,32})\b/gi)].map(m => m[1]).filter(valid);
  const evidence = (code: string) => valid(code) && (/\d/.test(code) || code === code.toUpperCase());
  const labelled = [...instruction.matchAll(/\b(?:booking\s+code|code)\s+([A-Z0-9_]{3,32})\b/gi)].map(m => m[1]).filter(evidence);
  const contextual = instruction.match(/\b(?:split|spilt|splate|divide|partition|modify)\s+([A-Z0-9_]{3,32})\b/i)?.[1];
  const standalone = instruction.split(/\r?\n/).map(s => s.trim()).find(c => /^[A-Z0-9_]{3,32}$/i.test(c) && /[A-Z]/i.test(c) && valid(c) && (/[0-9_]/.test(c) || (c === c.toUpperCase() && c.length === 6)));
  const plain = instruction.match(/\b[A-Z0-9]{6}\b/gi)?.find(c => /[A-Z]/i.test(c) && valid(c) && (/\d/.test(c) || c === c.toUpperCase()));
  const bookingCode = (marked.at(-1) ?? labelled.at(-1) ?? (contextual && evidence(contextual) ? contextual : undefined) ?? standalone ?? plain)?.toUpperCase();
  const isSplit = /\b(?:split|spilt|splate|divide|partition)\b|\bbreak\s+(?:it|this|the\s+code)\s+(?:up|into)\b/i.test(instruction);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, fifty: 50, hundred: 100 };
  const token = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|fifty|hundred)';
  const count = isSplit ? [...instruction.matchAll(new RegExp(`\\binto\\s+${token}\\b`, 'gi'))].at(-1)?.[1]
    ?? [...instruction.matchAll(new RegExp(`\\b${token}\\s+(?:parts?|pieces?|groups?|codes?|slips?)\\b`, 'gi'))].at(-1)?.[1] : undefined;
  return { bookingCode, isSplit, splitInto: count ? words[count.toLowerCase()] ?? Number(count) : undefined };
}

/** Explicit output count; game/selection counts are deliberately excluded. */
export function requestedTicketCount(instruction: string): number | undefined {
  const words: Record<string, number> = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100 };
  const units = 'one|two|three|four|five|six|seven|eight|nine';
  const tens = `(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:${units}))?`;
  const token = `(?:[0-9]+|one hundred|${tens}|${Object.keys(words).join('|')})`;
  const matches = [...instruction.matchAll(new RegExp(`\\b(${token})\\s+(?:(?!(?:games?|matches?|legs?|picks?|selections?|per|each|odds)\\b)[a-z-]+\\s+){0,3}(?:tickets?|codes?|slips?|bookings?|combinations?|versions?|parts?|pieces?|groups?)\\b`, 'gi'))];
  const last = matches.at(-1)?.[1] ?? (readChatRequest(instruction).isSplit ? [...instruction.matchAll(new RegExp(`\\binto\\s+(${token})\\b`, 'gi'))].at(-1)?.[1] : undefined);
  if (last) return /^\d+$/.test(last) ? Number(last) : last.toLowerCase().split(/[ -]+/).reduce((total, word) => total + (words[word] ?? 0), 0);
  return readChatRequest(instruction).splitInto;
}
