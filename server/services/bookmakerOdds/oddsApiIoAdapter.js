import { createMemoryCache } from '../../utils/cache.js';
import { nameScore } from '../../utils/normalize.js';
import {
  buildMissingKenyaRows,
  emptyMarkets,
  getImpliedProbabilities,
  normalizeBookmakerKey,
} from './kenyaBookmakers.js';

const API_KEY = process.env.ODDS_API_IO_KEY || '';
const BASE_URL = process.env.ODDS_API_IO_BASE_URL || 'https://api.odds-api.io/v3';
const BOOKMAKERS = process.env.ODDS_API_IO_BOOKMAKERS || '';
const CACHE_MS = Number(process.env.ODDS_API_IO_CACHE_MS || 60_000);
const cache = createMemoryCache({ ttlMs: CACHE_MS, maxEntries: 250 });

const isPlaceholderKey = (key) => !key || key.includes('your_') || key.includes('replace_') || key.includes('change-me');
const isConfigured = () => Boolean(API_KEY) && !isPlaceholderKey(API_KEY);

const fetchJson = async (path, params = {}) => {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', API_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Odds-API.io returned ${response.status}: ${JSON.stringify(data).slice(0, 160)}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const eventScore = (event, matchInput) => {
  const home = event.home || event.homeTeam || event.home_team;
  const away = event.away || event.awayTeam || event.away_team;
  const direct = (nameScore(home, matchInput.teamA) + nameScore(away, matchInput.teamB)) / 2;
  const reversed = (nameScore(home, matchInput.teamB) + nameScore(away, matchInput.teamA)) / 2;
  return Math.max(direct, reversed);
};

const findEvent = async (matchInput) => {
  const events = await cache.get(`odds-api-io:events:${matchInput.sport}:${matchInput.matchDate}`, async () => {
    const data = await fetchJson('/events', {
      sport: matchInput.sport.toLowerCase() === 'football' ? 'football' : matchInput.sport.toLowerCase(),
      date: matchInput.matchDate,
      limit: 100,
    });
    return Array.isArray(data) ? data : data.events || data.data || [];
  });

  return events
    .map((event) => ({ event, score: eventScore(event, matchInput) }))
    .sort((a, b) => b.score - a.score)[0];
};

const applyMarket = (markets, market = {}) => {
  const name = String(market.name || market.market || '').toLowerCase();
  const odds = Array.isArray(market.odds) ? market.odds[0] || {} : market.odds || market;

  if (name === 'ml' || name.includes('match') || name.includes('moneyline')) {
    markets.homeWin = Number(odds.home) || markets.homeWin;
    markets.draw = Number(odds.draw) || markets.draw;
    markets.awayWin = Number(odds.away) || markets.awayWin;
  }

  if (name.includes('over') || name.includes('total')) {
    const line = Number(odds.max || odds.line || odds.point || 2.5);
    if (Math.abs(line - 2.5) < 0.01) {
      markets.over25 = Number(odds.over) || markets.over25;
      markets.under25 = Number(odds.under) || markets.under25;
      markets.totalsLine = 2.5;
    }
  }

  if (name.includes('both teams') || name.includes('btts')) {
    markets.bttsYes = Number(odds.yes) || Number(odds.Yes) || markets.bttsYes;
    markets.bttsNo = Number(odds.no) || Number(odds.No) || markets.bttsNo;
  }
};

const toRows = (oddsData = {}) => {
  const bookmakers = oddsData.bookmakers || oddsData.data?.bookmakers || {};

  return Object.entries(bookmakers)
    .map(([bookmaker, marketsList]) => {
      const markets = emptyMarkets();
      const list = Array.isArray(marketsList) ? marketsList : Object.values(marketsList || {});
      list.forEach((market) => applyMarket(markets, market));
      return {
        bookmaker,
        key: normalizeBookmakerKey(bookmaker),
        status: 'live',
        lastUpdate: list.find((market) => market.updatedAt)?.updatedAt || oddsData.updatedAt || null,
        markets,
      };
    })
    .filter((row) => Object.values(row.markets).some((value) => typeof value === 'number'));
};

export const oddsApiIoAdapter = {
  id: 'odds-api-io',
  name: 'Odds-API.io Adapter',
  type: 'bookmaker-odds',
  isConfigured,
  async getOdds(matchInput) {
    if (!isConfigured()) {
      throw new Error('ODDS_API_IO_KEY is not configured.');
    }

    const best = await findEvent(matchInput);
    if (!best || best.score < 0.55) {
      throw new Error(`Odds-API.io returned no matching event for ${matchInput.teamA} vs ${matchInput.teamB}.`);
    }

    const eventId = best.event.id || best.event.eventId;
    if (!eventId) {
      throw new Error('Odds-API.io matched event had no event id.');
    }

    const oddsData = await cache.get(`odds-api-io:odds:${eventId}:${BOOKMAKERS}`, () =>
      fetchJson('/odds', {
        eventId,
        bookmakers: BOOKMAKERS,
      }),
    );
    const liveRows = toRows(oddsData);

    if (!liveRows.length) {
      throw new Error('Odds-API.io returned no displayable bookmaker odds.');
    }

    const returnedKeys = new Set(liveRows.map((row) => normalizeBookmakerKey(row.key || row.bookmaker)));
    const missingRows = buildMissingKenyaRows(returnedKeys);
    const rows = [...liveRows, ...missingRows];

    return {
      provider: this.name,
      sourceMode: 'real-api',
      matchKey: `${matchInput.teamA}::${matchInput.teamB}::${matchInput.matchDate}`,
      impliedProbabilities: getImpliedProbabilities(rows),
      bookmakers: rows,
      fetchedAt: new Date().toISOString(),
      matchedEvent: {
        id: eventId,
        homeTeam: best.event.home || best.event.homeTeam || best.event.home_team,
        awayTeam: best.event.away || best.event.awayTeam || best.event.away_team,
        score: Number(best.score.toFixed(2)),
      },
      bookmakerView: 'kenya',
      requestedBookmakers: BOOKMAKERS || 'Odds-API.io default bookmakers',
      returnedBookmakers: liveRows.map((row) => row.bookmaker).join(', '),
      unavailableBookmakers: missingRows.map((row) => row.bookmaker).join(', '),
      markets: 'Odds-API.io available markets',
      note: 'Odds returned by Odds-API.io where available. Kenyan direct-book feeds remain labelled when not returned.',
      dataQuality: {
        status: 'real',
        realFields: ['bookmaker odds'],
        missingFields: missingRows.map((row) => `${row.bookmaker} direct feed`),
        note: 'Odds-API.io returned real bookmaker odds for the matched event.',
      },
    };
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: isConfigured() ? 'online' : 'needs_config',
      mode: isConfigured() ? 'real-api' : 'provider-not-connected',
      updateCadence: isConfigured() ? `Cached for ${Math.round(CACHE_MS / 1000)} seconds` : 'Set ODDS_API_IO_KEY to enable this backup odds provider',
    };
  },
};
