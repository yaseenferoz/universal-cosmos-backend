import { describe, expect, it, vi } from 'vitest';
import { requestJson } from '../src/integrations/http.js';

const endpoint = 'https://images-api.nasa.gov/search?q=Mars';
describe('safe provider HTTP', () => {
  it.each(['http://images-api.nasa.gov/search', 'https://127.0.0.1/', 'https://example.com/', 'https://user:password@images-api.nasa.gov/', 'https://images-api.nasa.gov:444/search'])('blocks unsafe URLs: %s', async (url) => {
    const upstream = vi.fn<typeof fetch>();
    await expect(requestJson(url, { fetch: upstream })).rejects.toMatchObject({ code: 'UNSAFE_PROVIDER_URL' });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('limits actual body bytes even when Content-Length is absent', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ payload: 'x'.repeat(100) })));
    await expect(requestJson(endpoint, { fetch: upstream, maxBytes: 20 })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_TOO_LARGE' });
  });
  it('rejects non-JSON and failed HTTP responses', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>failed</html>')).mockResolvedValueOnce(new Response('secret error', { status: 429 }));
    await expect(requestJson(endpoint, { fetch: upstream })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
    await expect(requestJson(endpoint, { fetch: upstream })).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
  });
  it('aborts timed out requests', async () => {
    const upstream = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await expect(requestJson(endpoint, { fetch: upstream, timeoutMs: 10 })).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  });
  it('normalizes transport failures and forbids redirect following', async () => {
    const upstream = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('TLS details'));
    await expect(requestJson(endpoint, { fetch: upstream })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(upstream.mock.calls[0]![1]?.redirect).toBe('error');
  });
});
