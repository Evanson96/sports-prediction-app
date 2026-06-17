import { createMemoryCache } from '../../utils/cache.js';

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY || '';
const BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const CACHE_MS = Number(process.env.API_FOOTBALL_CACHE_MS || 5 * 60 * 1000);
const cache = createMemoryCache({ ttlMs: CACHE_MS, maxEntries: 700 });

const providerState = {
  providerStatus: API_KEY ? 'connected' : 'missing_api_key',
  message: API_KEY ? 'API key configured.' : 'Set API_FOOTBALL_KEY to enable API-Football.',
  lastCheckedAt: null,
};

const isPlaceholderKey = (key) =>
  !key || key.includes('your_') || key.includes('replace_') || key.includes('change-me') || key === 'demo';

const updateProviderState = (providerStatus, message) => {
  providerState.providerStatus = providerStatus;
  providerState.message = message;
  providerState.lastCheckedAt = new Date().toISOString();
};

const apiFootballError = (message, providerStatus, details = {}) => {
  const error = new Error(message);
  error.provider = 'api-football';
  error.providerStatus = providerStatus;
  Object.assign(error, details);
  return error;
};

const errorText = (data) => {
  if (!data) return '';
  if (Array.isArray(data.errors)) return data.errors.join(', ');
  if (data.errors && typeof data.errors === 'object') return JSON.stringify(data.errors);
  return JSON.stringify(data);
};

const classifyProviderError = ({ response, data }) => {
  const text = errorText(data).toLowerCase();

  if (response?.status === 429 || /rate|quota|limit|request|subscription|plan/.test(text)) {
    return 'free_limit_reached';
  }

  return 'provider_error';
};

export const isApiFootballConfigured = () => Boolean(API_KEY) && !isPlaceholderKey(API_KEY);

export const getApiFootballSeason = (date = new Date().toISOString().slice(0, 10)) => {
  if (process.env.API_FOOTBALL_SEASON) return process.env.API_FOOTBALL_SEASON;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return String(parsed.getUTCFullYear());
};

export const getApiFootballStatus = () => {
  const configured = isApiFootballConfigured();
  const providerStatus = configured ? providerState.providerStatus || 'connected' : 'missing_api_key';

  return {
    id: 'api-football',
    name: 'API-Football',
    type: 'sports-data',
    status: providerStatus === 'connected' ? 'online' : providerStatus === 'missing_api_key' ? 'needs_config' : 'degraded',
    providerStatus,
    mode: configured ? 'real-api' : 'provider-not-connected',
    updateCadence: configured
      ? `Cached for ${Math.round(CACHE_MS / 1000)} seconds`
      : 'Set API_FOOTBALL_KEY to enable the primary football provider',
    message: configured ? providerState.message : 'API_FOOTBALL_KEY is missing or a placeholder.',
    lastCheckedAt: providerState.lastCheckedAt,
    baseUrl: BASE_URL,
  };
};

export const fetchApiFootballJson = async (path, params = {}, { timeoutMs = 12_000, cacheKey = null } = {}) => {
  if (!isApiFootballConfigured()) {
    updateProviderState('missing_api_key', 'API_FOOTBALL_KEY is missing or a placeholder.');
    throw apiFootballError('API_FOOTBALL_KEY is not configured.', 'missing_api_key');
  }

  const loader = async () => {
    const url = new URL(`${BASE_URL}/${path.replace(/^\//, '')}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'x-apisports-key': API_KEY,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const providerStatus = classifyProviderError({ response, data });
        const message = `API-Football returned ${response.status}: ${errorText(data).slice(0, 180)}`;
        updateProviderState(providerStatus, message);
        throw apiFootballError(message, providerStatus, { statusCode: response.status, providerErrors: data.errors });
      }

      if (Array.isArray(data.errors) && data.errors.length) {
        const providerStatus = classifyProviderError({ response, data });
        const message = `API-Football error: ${data.errors.join(', ')}`;
        updateProviderState(providerStatus, message);
        throw apiFootballError(message, providerStatus, { providerErrors: data.errors });
      }

      if (data.errors && typeof data.errors === 'object' && Object.keys(data.errors).length > 0) {
        const providerStatus = classifyProviderError({ response, data });
        const message = `API-Football error: ${JSON.stringify(data.errors).slice(0, 180)}`;
        updateProviderState(providerStatus, message);
        throw apiFootballError(message, providerStatus, { providerErrors: data.errors });
      }

      if (Array.isArray(data.response) && data.response.length === 0) {
        updateProviderState('no_data', `API-Football returned no data for ${path}.`);
      } else {
        updateProviderState('connected', `API-Football returned data for ${path}.`);
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        updateProviderState('provider_error', `API-Football timed out after ${timeoutMs}ms.`);
        throw apiFootballError(`API-Football timed out after ${timeoutMs}ms.`, 'provider_error');
      }

      if (error.providerStatus) throw error;

      updateProviderState('provider_error', error.message);
      throw apiFootballError(error.message, 'provider_error');
    } finally {
      clearTimeout(timeout);
    }
  };

  if (!cacheKey) return loader();
  return cache.get(cacheKey, loader);
};
