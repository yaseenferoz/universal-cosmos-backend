import { AppError } from '../utils/errors.js';

const PROVIDER_HOSTS = new Set([
  'ssd.jpl.nasa.gov', 'images-api.nasa.gov', 'gea.esac.esa.int',
  'exoplanetarchive.ipac.caltech.edu', 'simbad.cds.unistra.fr', 'simbad.cfa.harvard.edu',
]);

export interface UpstreamRequestOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  allowedHosts?: readonly string[];
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

/** Only adapters construct URLs. The optional host list further restricts the fixed allowlist. */
export async function requestJson<T = unknown>(input: URL | string, options: UpstreamRequestOptions = {}): Promise<T> {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError(502, 'UNSAFE_PROVIDER_URL', 'Invalid provider URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !PROVIDER_HOSTS.has(url.hostname) || (options.allowedHosts && !options.allowedHosts.includes(url.hostname))) {
    throw new AppError(502, 'UNSAFE_PROVIDER_URL', 'Provider URL is not allowed');
  }
  const maxBytes = options.maxBytes ?? 4_000_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await (options.fetch ?? fetch)(url, {
      method: options.method ?? 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...options.headers },
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(502, response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_HTTP_ERROR',
        'Scientific data provider is temporarily unavailable');
    }
    const advertisedLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
      await response.body?.cancel();
      throw new AppError(502, 'PROVIDER_RESPONSE_TOO_LARGE', 'Scientific data provider response exceeded the limit');
    }
    if (!response.body) throw new AppError(502, 'INVALID_PROVIDER_RESPONSE', 'Scientific data provider returned no data');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new AppError(502, 'PROVIDER_RESPONSE_TOO_LARGE', 'Scientific data provider response exceeded the limit');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T; }
    catch { throw new AppError(502, 'INVALID_PROVIDER_RESPONSE', 'Scientific data provider returned invalid JSON'); }
  } catch (error) {
    if (controller.signal.aborted) throw new AppError(504, 'PROVIDER_TIMEOUT', 'Scientific data provider request timed out');
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'Scientific data provider could not be reached');
  } finally {
    clearTimeout(timeout);
    reader?.releaseLock();
  }
}
