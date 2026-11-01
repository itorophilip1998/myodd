import { afterEach, expect, it, vi } from 'vitest';
import { AiClient } from '../src/ai/ai.client';
import { generationConfigSchema, SupportedMarket } from '@myodd/shared';

afterEach(() => vi.unstubAllGlobals());
it('preserves sanitized provider errors for job progress and the UI', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'OpenAI authentication or model access failed.' }), { status: 502 })));
  await expect(new AiClient().parse('Generate 3 slips')).rejects.toThrow('OpenAI authentication or model access failed.');
});
it('does not forward raw validation error arrays', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ input: 'private value' }] }), { status: 422 })));
  await expect(new AiClient().parse('Generate 3 slips')).rejects.toThrow('AI returned HTTP 422');
});
it('deduplicates interpretation reads while isolating callers from mutable cached configurations', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(generationConfigSchema.parse({}))));
  vi.stubGlobal('fetch', fetch);
  const cache = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn().mockResolvedValue(undefined) };
  const client = new AiClient(cache as any);
  const [a, b] = await Promise.all([client.parse('Generate tickets'), client.parse('Generate tickets')]);
  expect(fetch).toHaveBeenCalledTimes(1);
  a.markets.push(SupportedMarket.HOME);
  expect(b.markets).toEqual([]);
  expect(cache.setJson).toHaveBeenCalledWith(expect.stringMatching(/^intent:/), expect.any(Object), 300);
});
it('does not share interpretation cache entries across different account preferences', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{}')));
  const cache = { getJson: vi.fn().mockResolvedValue(null), setJson: vi.fn().mockResolvedValue(undefined) };
  const client = new AiClient(cache as any);
  await client.parse('Generate tickets', [], { riskMode: 'INVESTOR' });
  await client.parse('Generate tickets', [], { riskMode: 'JAPA' });
  expect(cache.getJson.mock.calls[0][0]).not.toBe(cache.getJson.mock.calls[1][0]);
});
it('rejects malformed generation results at the AI boundary with an actionable message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: null }))));
  await expect(new AiClient().generate([], generationConfigSchema.parse({}))).rejects.toThrow('generation service returned incomplete data');
});

it.each([
  ['INVESTOR', 'investor'], ['GAMBLER', 'gambler'], ['JAPA', 'japa'], ['LAGOS_LIFE', 'lagos-life'],
] as const)('routes %s generation directly to its agent', async (riskMode, route) => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await new AiClient().generate([], generationConfigSchema.parse({ riskMode })).catch(() => undefined);
  expect(fetch.mock.calls[0][0]).toMatch(new RegExp(`/generate/${route}$`));
  expect(JSON.parse(fetch.mock.calls[0][1].body).config.riskMode).toBe(riskMode);
});

it('uses the prediction agent and independent split tool endpoints', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const client = new AiClient();
  await client.predict([]);
  await client.split([], generationConfigSchema.parse({}), [], 2).catch(() => undefined);
  expect(fetch.mock.calls[0][0]).toMatch(/\/generate\/prediction$/);
  expect(fetch.mock.calls[1][0]).toMatch(/\/tools\/split$/);
});
