import { fetchApiFootballJson, getApiFootballStatus, isApiFootballConfigured } from '../providers/apiFootballClient.js';
import {
  buildMissingKenyaRows,
  emptyMarkets,
  getImpliedProbabilities,
  normalizeBookmakerKey,
} from './kenyaBookmakers.js';

const price = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const setMarketFromBet = (markets, bet = {}) => {
  const name = String(bet.name || bet.label || '').toLowerCase();
  const values = Array.isArray(bet.values) ? bet.values : [];

  if (name.includes('match winner') || name === '1x2' || name.includes('fulltime result')) {
    values.forEach((value) => {
      const label = String(value.value || '').toLowerCase();
      if (['home', '1'].includes(label)) markets.homeWin = price(value.odd);
      if (['draw', 'x'].includes(label)) markets.draw = price(value.odd);
      if (['away', '2'].includes(label)) markets.awayWin = price(value.odd);
    });
  }

  if (name.includes('goals over/under') || name.includes('over/under')) {
    values.forEach((value) => {
      const label = String(value.value || '').toLowerCase();
      if (label.includes('over 2.5')) {
        markets.over25 = price(value.odd);
        markets.totalsLine = 2.5;
      }
      if (label.includes('under 2.5')) {
        markets.under25 = price(value.odd);
        markets.totalsLine = 2.5;
      }
    });
  }

  if (name.includes('both teams') || name.includes('btts')) {
    values.forEach((value) => {
      const label = String(value.value || '').toLowerCase();
      if (label === 'yes') markets.bttsYes = price(value.odd);
      if (label === 'no') markets.bttsNo = price(value.odd);
    });
  }
};

const toRows = (bookmakers = []) =>
  bookmakers
    .map((bookmaker) => {
      const markets = emptyMarkets();
      (bookmaker.bets || []).forEach((bet) => setMarketFromBet(markets, bet));
      return {
        bookmaker: bookmaker.name,
        key: normalizeBookmakerKey(bookmaker.name),
        status: 'live',
        lastUpdate: null,
        markets,
      };
    })
    .filter((row) => Object.values(row.markets).some((value) => typeof value === 'number'));

export const apiFootballOddsAdapter = {
  id: 'api-football-odds',
  name: 'API-Football Odds Adapter',
  type: 'bookmaker-odds',
  isConfigured: () => isApiFootballConfigured(),
  async getOdds(matchInput) {
    if (!isApiFootballConfigured() || matchInput.sport !== 'Football' || !matchInput.providerFixtureId) {
      throw new Error('API-Football odds provider not connected for this fixture.');
    }

    const data = await fetchApiFootballJson(
      'odds',
      { fixture: matchInput.providerFixtureId },
      { cacheKey: `api-football:odds:${matchInput.providerFixtureId}` },
    );
    const row = Array.isArray(data.response) ? data.response[0] : null;
    const liveRows = toRows(row?.bookmakers || []);

    if (!liveRows.length) {
      throw new Error('API-Football returned no displayable odds for this fixture.');
    }

    const returnedKeys = new Set(liveRows.map((item) => normalizeBookmakerKey(item.key || item.bookmaker)));
    const rows = [...liveRows, ...buildMissingKenyaRows(returnedKeys)];

    return {
      provider: this.name,
      sourceMode: 'real-api',
      matchKey: `${matchInput.teamA}::${matchInput.teamB}::${matchInput.matchDate}`,
      impliedProbabilities: getImpliedProbabilities(rows),
      bookmakers: rows,
      fetchedAt: new Date().toISOString(),
      bookmakerView: 'kenya',
      requestedBookmakers: 'API-Football provider bookmakers plus Kenyan direct-feed placeholders',
      returnedBookmakers: liveRows.map((item) => item.bookmaker).join(', '),
      unavailableBookmakers: buildMissingKenyaRows(returnedKeys).map((item) => item.bookmaker).join(', '),
      markets: 'API-Football available markets',
      dataQuality: {
        status: 'real',
        realFields: ['bookmaker odds'],
        missingFields: rows.filter((row) => row.status !== 'live').map((row) => `${row.bookmaker} direct feed`),
        note: 'Odds returned by API-Football. Kenyan bookmakers remain direct-feed-required unless returned by a real provider.',
      },
      note: 'Odds returned by API-Football where available. SportPesa, Betika, Odibets, and BetPawa remain direct-feed-required unless a real feed returns them.',
    };
  },
  async status() {
    const status = getApiFootballStatus();
    return {
      ...status,
      id: this.id,
      name: this.name,
      type: this.type,
    };
  },
};
