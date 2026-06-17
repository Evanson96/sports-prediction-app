export const createMemoryCache = ({ ttlMs = 60_000, maxEntries = 250 } = {}) => {
  const cache = new Map();

  const prune = () => {
    const now = Date.now();
    for (const [key, record] of cache.entries()) {
      if (now - record.createdAt >= ttlMs) {
        cache.delete(key);
      }
    }

    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value);
    }
  };

  return {
    async get(key, loader) {
      const cached = cache.get(key);
      if (cached && Date.now() - cached.createdAt < ttlMs) {
        return cached.value;
      }

      const value = await loader();
      cache.set(key, { createdAt: Date.now(), value });
      prune();
      return value;
    },
    clear() {
      cache.clear();
    },
    stats() {
      prune();
      return {
        size: cache.size,
        ttlMs,
        maxEntries,
      };
    },
  };
};
