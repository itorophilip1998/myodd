import { describe, expect, it, vi } from 'vitest';
import { readChatRequest } from '@myodd/shared';
import { SlipsService } from '../src/slips/slips.service';

describe('chat code and split extraction', () => {
  it.each([
    ['Split ME9915 into 5 parts using Investor Mode', 'ME9915', 5],
    ['ME9915\nPlease split into three codes', 'ME9915', 3],
    ['Divide code TVXRGA into 4 pieces', 'TVXRGA', 4],
    ['spilt @abc123 into 2 parts', 'ABC123', 2],
    ['https://www.sportybet.com/ng/?shareCode=GNPM8T split into 6', 'GNPM8T', 6],
  ])('extracts %s', (text, code, parts) => { expect(readChatRequest(text)).toEqual({ bookingCode: code, isSplit: true, splitInto: parts }); });
  it.each(['Create 1 code between 3 and 5 odds', 'Create 20 codes using Investor Mode', 'make this code less risky', 'split this into 4 parts'])('does not mistake prose for a source code: %s', text => { expect(readChatRequest(text).bookingCode).toBeUndefined(); });
  it('detects bare codes and missing part counts separately', () => {
    expect(readChatRequest('TVXRGA').bookingCode).toBe('TVXRGA');
    expect(readChatRequest('my_alias_7\nSplit into 3 parts').bookingCode).toBe('MY_ALIAS_7');
    expect(readChatRequest('Split GNPM8T into 3 parts. Final settings: into 5 parts').splitInto).toBe(5);
    expect(readChatRequest('Split GNPM8T into 3. Source code: YH7CEW.').bookingCode).toBe('YH7CEW');
    expect(readChatRequest('Split @TVXRGA')).toEqual({ bookingCode: 'TVXRGA', isSplit: true, splitInto: undefined });
  });
  it('rejects an ambiguous split before creating any database records', async () => {
    const transaction = vi.fn();
    const service = new SlipsService({} as any, {} as any, {} as any, {} as any, { $transaction: transaction } as any, {} as any, {} as any);
    await expect(service.startGeneration({ instruction: 'Split ME9915 using Investor Mode' })).rejects.toThrow('How many parts');
    expect(transaction).not.toHaveBeenCalled();
  });
});
