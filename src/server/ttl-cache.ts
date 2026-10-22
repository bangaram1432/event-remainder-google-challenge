interface Entry<V> {
  value: V;
  expiresAt: number;
}

/** Small LRU cache with per-entry expiry. Time is passed in so behaviour is deterministic under test. */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string, nowMs: number): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= nowMs) return undefined;
    this.entries.set(key, entry); // re-insert: most recently used goes last
    return entry.value;
  }

  set(key: string, value: V, nowMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: nowMs + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
