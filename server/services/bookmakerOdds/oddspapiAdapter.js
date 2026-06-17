import { createMemoryCache } from '../../utils/cache.js';
import { nameScore } from '../../utils/normalize.js';
import { buildMissingKenyaRows, emptyMarkets, getImpliedProbabilities, normalizeBookmakerKey } from './kenyaBookmakers.js';

const API_KEY = process.env.ODDSPAPI_KEY || '';
const BASE_URL = process.env.ODDSPAPI_BASE_URL || 'https://api.oddspapi.io/v4';
const ENABLED = process.env.ODDSPAPI_ENABLED === 'true';
const BOOKMAKER = process.env.ODDSPAPI_BOOKMAKER || 'mozzartbet';
const TOURNAMENT_IDS = process.env.ODDSPAPI_TOURNAMENT_IDS || '';
const CACHE_MS = Number(process.env.ODDSPAPI_CACHE_MS || 60_000);
const cache = createMemoryCache({ ttlMs: CACHE_MS, maxEntries: 120 });

const isPlaceholderKey = (key) => !key || key.includes('your_') || key.includes('replace_') || key.includes('change-me');
const isConfigured = () => ENABLED && Boolean(API_KEY) && !isPlaceholderKey(API_KEY) && Boolean(TOURNAMENT_IDS);

const fetchJson = async (path, params = {}) => {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', API_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OddsPapi returned ${response.status}: ${JSON.stringify(data).slice(0, 160)}`);
  }
  return data;
};

const eventScore = (fixture, matchInput) => {
  const direct = (nameScore(fixture.participant1Name, matchInput.teamA) + nameScore(fixture.participant2Name, matchInput.teamB)) / 2;
  const reversed = (nameScore(fixture.participant1Name, matchInput.teamB) + nameScore(fixture.participant2Name, matchInput.teamA)) / 2;
  return Math.max(direct, reversed);
};

const parseMozzartMarkets = (fixture) => {
  const markets = emptyMarkets();
  const bookmaker = fixture.bookmakerOdds?.[BOOKMAKER] || fixture.bookmakerOdds?.['mozzartbet'] || {};
  const marketValues = bookmaker.markets || {};

  Object.values(marketValues).forEach((market) => {
    const outcomes = market.outcomes || {};
    Object.values(outcomes).forEach((outcome) => {
      const player = outcome.players?.['0'] || Object.values(outcome.players || {})[0] || {};
      const outcomeId = String(player.bookmakerOutcomeId || '').toLowerCase();
      const price = Number(player.price);
      if (!Number.isFinite(price)) return;
      if (outcomeId === 'home') markets.homeWin = price;
      if (outcomeId === 'draw') markets.draw = price;
      if (outcomeId === 'away') markets.awayWin = price;
      if (outcomeId.includes('over') && outcomeId.includes('2.5')) {
        markets.over25 = price;
        markets.totalsLine = 2.5;
      }
      if (outcomeId.includes('under') && outcomeId.includes('2.5')) {
        markets.under25 = price;
        markets.totalsLine = 2.5;
      }
    });
  });

  return markets;
};

export const oddspapiAdapter = {
  id: 'oddspapi-mozzartbet',
  name: 'OddsPapi Mozzart Bet Adapter',
  type: 'bookmaker-odds',
  isConfigured,
  async getOdds(matchInput) {
    if (!isConfigured()) {
      throw new Error('OddsPapi optional Mozzart Bet adapter is not enabled/configured.');
    }

    const fixtures = await cache.get(`oddspapi:${BOOKMAKER}:${TOURNAMENT_IDS}`, async () => {
      const data = await fetchJson('/odds-by-tournaments', {
        bookmaker: BOOKMAKER,
        tournamentIds: TOURNAMENT_IDS,
        oddsFormat: 'decimal',
      });
      return Array.isArray(data) ? data : data.data || [];
    });

    const best = fixtures
      .map((fixture) => ({ fixture, score: eventScore(fixture, matchInput) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < 0.55) {
      throw new Error('OddsPapi returned no matching Mozzart Bet fixture.');
    }

    const markets = parseMozzartMarkets(best.fixture);
    if (!Object.values(markets).some((value) => typeof value === 'number')) {
      throw new Error('OddsPapi returned no displayable Mozzart Bet markets.');
    }

    const liveRows = [
      {
        bookmaker: 'Mozzart Bet',
        key: 'mozzartbet',
        status: 'live',
        lastUpdate: best.fixture.updatedAt || null,
        markets,
      },
    ];
    const returnedKeys = new Set(liveRows.map((row) => normalizeBookmakerKey(row.key)));
    const missingRows = buildMissingKenyaRows(returnedKeys);
    const rows = [...liveRows, ...missingRows];

    return {
      provider: this.name,
      sourceMode: 'real-api',
      matchKey: `${matchInput.teamA}::${matchInput.teamB}::${matchInput.matchDate}`,
      impliedProbabilities: getImpliedProbabilities(rows),
      bookmakers: rows,
      fetchedAt: new Date().toISOString(),
      bookmakerView: 'kenya',
      requestedBookmakers: 'Mozzart Bet via OddsPapi optional adapter',
      returnedBookmakers: 'Mozzart Bet',
      unavailableBookmakers: missingRows.map((row) => row.bookmaker).join(', '),
      markets: 'OddsPapi available markets',
      note: 'Optional OddsPapi Mozzart Bet test feed returned odds. Other Kenyan bookmakers remain direct-feed-required.',
      dataQuality: {
        status: 'real',
        realFields: ['Mozzart Bet odds'],
        missingFields: missingRows.map((row) => `${row.bookmaker} direct feed`),
        note: 'OddsPapi is enabled only for Mozzart Bet testing.',
      },
    };
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: isConfigured() ? 'online' : ENABLED ? 'needs_config' : 'optional',
      mode: isConfigured() ? 'real-api' : ENABLED ? 'provider-not-connected' : 'optional-disabled',
      updateCadence: isConfigured()
        ? `Cached for ${Math.round(CACHE_MS / 1000)} seconds`
        : 'Set ODDSPAPI_ENABLED=true, ODDSPAPI_KEY, and ODDSPAPI_TOURNAMENT_IDS to test Mozzart Bet odds',
    };
  },
};
