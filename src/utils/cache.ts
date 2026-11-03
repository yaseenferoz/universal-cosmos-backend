import { AppError } from './errors.js';

/** Process-local bounded LRU/TTL cache. Failed loads are never cached. */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 128, private readonly ttlMs = 3_600_000,
    private readonly now: () => number = Date.now) {
    if (maxEntries < 1 || ttlMs < 1) throw new RangeError('Cache limits must be positive');
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    for (const [oldKey, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(oldKey);
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const value = this.get(key);
    if (value !== undefined) return Promise.resolve(value);
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= this.maxEntries) return Promise.reject(new AppError(503, 'PROVIDER_BUSY', 'Scientific data provider queue is full'));
    const promise = Promise.resolve().then(load).then((result) => {
      this.set(key, result);
      return result;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }
}
