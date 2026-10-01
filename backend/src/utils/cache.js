'use strict';

/**
 * Small in-memory TTL cache that also de-duplicates concurrent loads of the
 * same key, so a burst of identical requests results in one upstream call.
 * Good enough for a single instance; swap for Redis when running several.
 */
class TtlCache {
    constructor({ maxEntries = 1000, now = Date.now } = {}) {
        this.maxEntries = maxEntries;
        this.now = now;
        this.entries = new Map();
        this.inflight = new Map();
    }

    get(key) {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key, value, ttlMs) {
        if (this.entries.size >= this.maxEntries) {
            // Map preserves insertion order: drop the oldest entry.
            this.entries.delete(this.entries.keys().next().value);
        }
        this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    }

    async wrap(key, ttlMs, loader) {
        const cached = this.get(key);
        if (cached !== undefined) return cached;
        if (this.inflight.has(key)) return this.inflight.get(key);
        const promise = (async () => {
            try {
                const value = await loader();
                this.set(key, value, ttlMs);
                return value;
            } finally {
                this.inflight.delete(key);
            }
        })();
        this.inflight.set(key, promise);
        return promise;
    }

    clear() {
        this.entries.clear();
    }
}

module.exports = { TtlCache };
