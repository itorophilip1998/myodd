import { afterEach, expect, it, vi } from 'vitest';
import { AiClient } from '../src/ai/ai.client';

afterEach(() => vi.unstubAllGlobals());
it('preserves sanitized provider errors for job progress and the UI', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'OpenAI authentication or model access failed.' }), { status: 502 })));
  await expect(new AiClient().parse('Generate 3 slips')).rejects.toThrow('OpenAI authentication or model access failed.');
});
it('does not forward raw validation error arrays', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ input: 'private value' }] }), { status: 422 })));
  await expect(new AiClient().parse('Generate 3 slips')).rejects.toThrow('AI returned HTTP 422');
});
