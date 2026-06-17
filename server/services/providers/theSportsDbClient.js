import { createMemoryCache } from '../../utils/cache.js';

const configuredKey = process.env.THESPORTSDB_API_KEY || '';
const allowDevKey = process.env.NODE_ENV !== 'production';
const API_KEY = configuredKey || (allowDevKey ? '123' : '');
const BASE_URL = API_KEY ? `https://www.thesportsdb.com/api/v1/json/${API_KEY}` : '';
const CACHE_MS = Number(process.env.THESPORTSDB_CACHE_MS || 5 * 60 * 1000);
const cache = createMemoryCache({ ttlMs: CACHE_MS, maxEntries: 600 });

const isPlaceholderKey = (key) => !key || key === '123' || key.includes('your_') || key.includes('change-me');

export const isTheSportsDbConfigured = () => Boolean(API_KEY) && (process.env.NODE_ENV !== 'production' || !isPlaceholderKey(API_KEY));

export const getTheSportsDbStatus = () => ({
  id: 'thesportsdb',
  name: 'TheSportsDB',
  type: 'sports-data',
  status: isTheSportsDbConfigured() ? 'online' : 'needs_config',
  mode: isTheSportsDbConfigured() ? 'real-api' : allowDevKey && API_KEY === '123' ? 'dev-free-key' : 'not-configured',
  updateCadence: `Cached for ${Math.round(CACHE_MS / 1000)} seconds`,
});

export const fetchTheSportsDbJson = async (path, params = {}, { timeoutMs = 12_000, cacheKey = null } = {}) => {
  if (!isTheSportsDbConfigured()) {
    throw new Error('THESPORTSDB_API_KEY is required for live sports data in production.');
  }

  const loader = async () => {
    const url = new URL(`${BASE_URL}/${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`TheSportsDB returned ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  if (!cacheKey) return loader();
  return cache.get(cacheKey, loader);
};
