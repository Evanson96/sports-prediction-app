import { createMemoryCache } from '../../utils/cache.js';

const cache = createMemoryCache({ ttlMs: Number(process.env.WEATHER_CACHE_MS || 30 * 60 * 1000), maxEntries: 350 });
const TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Nairobi';

const fallbackCoordinates = {
  Kenya: { latitude: -1.286389, longitude: 36.817223, label: 'Nairobi, Kenya' },
  England: { latitude: 51.5072, longitude: -0.1276, label: 'London, England' },
  Spain: { latitude: 40.4168, longitude: -3.7038, label: 'Madrid, Spain' },
  Germany: { latitude: 52.52, longitude: 13.405, label: 'Berlin, Germany' },
  Italy: { latitude: 41.9028, longitude: 12.4964, label: 'Rome, Italy' },
  France: { latitude: 48.8566, longitude: 2.3522, label: 'Paris, France' },
  USA: { latitude: 40.7128, longitude: -74.006, label: 'New York, USA' },
  International: { latitude: -1.286389, longitude: 36.817223, label: 'Nairobi default for international fixtures' },
};

const fetchJson = async (url, timeoutMs = 8_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Weather provider returned ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const geocode = async ({ venue, country }) => {
  const query = [venue, country].filter(Boolean).join(', ');
  if (!query.trim()) return fallbackCoordinates[country] || fallbackCoordinates.International;

  try {
    return await cache.get(`weather-geocode:${query}`, async () => {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', query);
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'en');
      url.searchParams.set('format', 'json');
      const data = await fetchJson(url);
      const first = Array.isArray(data.results) ? data.results[0] : null;

      if (!first) {
        return fallbackCoordinates[country] || fallbackCoordinates.International;
      }

      return {
        latitude: first.latitude,
        longitude: first.longitude,
        label: [first.name, first.country].filter(Boolean).join(', '),
      };
    });
  } catch {
    return fallbackCoordinates[country] || fallbackCoordinates.International;
  }
};

const riskFromForecast = (daily = {}) => {
  const rainProbability = Number(daily.precipitation_probability_max?.[0] || 0);
  const wind = Number(daily.wind_speed_10m_max?.[0] || 0);
  const temp = Number(daily.temperature_2m_max?.[0] || 22);
  const rainRisk = rainProbability >= 70 ? 4 : rainProbability >= 40 ? 2 : 0;
  const windRisk = wind >= 32 ? 3 : wind >= 22 ? 1 : 0;
  const tempRisk = temp >= 34 || temp <= 4 ? 2 : 0;

  return Math.min(10, 2 + rainRisk + windRisk + tempRisk);
};

const conditionFromForecast = (daily = {}) => {
  const rainProbability = Number(daily.precipitation_probability_max?.[0] || 0);
  const wind = Number(daily.wind_speed_10m_max?.[0] || 0);
  const temp = Number(daily.temperature_2m_max?.[0] || 22);

  if (rainProbability >= 70) return `High rain chance, around ${Math.round(temp)}C`;
  if (rainProbability >= 40) return `Possible showers, around ${Math.round(temp)}C`;
  if (wind >= 32) return `Windy conditions, around ${Math.round(temp)}C`;
  return `Normal playing weather, around ${Math.round(temp)}C`;
};

export const openMeteoWeatherAdapter = {
  id: 'open-meteo-weather',
  name: 'Open-Meteo Weather Adapter',
  type: 'weather',
  async getMatchWeather({ country = 'International', venue = '', matchDate }) {
    const coordinates = await geocode({ venue, country });

    try {
      const forecast = await cache.get(`forecast:${coordinates.latitude}:${coordinates.longitude}:${matchDate}`, async () => {
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.set('latitude', coordinates.latitude);
        url.searchParams.set('longitude', coordinates.longitude);
        url.searchParams.set('daily', 'temperature_2m_max,precipitation_probability_max,wind_speed_10m_max');
        url.searchParams.set('timezone', TIMEZONE);
        url.searchParams.set('start_date', matchDate);
        url.searchParams.set('end_date', matchDate);
        return fetchJson(url);
      });

      return {
        provider: this.name,
        mode: 'real-api',
        dataQuality: {
          status: venue ? 'real' : 'partial_real',
          realFields: ['forecast', 'temperature', 'rain probability', 'wind speed'],
          missingFields: venue ? [] : ['exact stadium location'],
          note: venue ? 'Forecast matched using venue and country.' : 'Forecast uses a country-level fallback coordinate.',
        },
        condition: conditionFromForecast(forecast.daily),
        riskImpact: riskFromForecast(forecast.daily),
        temperatureC: Number(forecast.daily?.temperature_2m_max?.[0] || 22),
        location: coordinates.label,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return {
        provider: this.name,
        mode: 'missing',
        dataQuality: {
          status: 'missing',
          realFields: [],
          missingFields: ['weather forecast'],
          note: 'Weather provider did not return data, so weather is treated neutrally.',
        },
        condition: 'Weather unavailable',
        riskImpact: 0,
        temperatureC: null,
        location: coordinates.label,
        fetchedAt: new Date().toISOString(),
      };
    }
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: 'online',
      mode: 'real-api',
      updateCadence: `Cached for ${Math.round(Number(process.env.WEATHER_CACHE_MS || 30 * 60 * 1000) / 1000)} seconds`,
    };
  },
};
