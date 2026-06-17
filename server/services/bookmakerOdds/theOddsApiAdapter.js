const API_KEY = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || '';
const BASE_URL = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com';
const DEFAULT_REGIONS = process.env.ODDS_API_REGIONS || 'uk,eu';
const DEFAULT_MARKETS = process.env.ODDS_API_MARKETS || 'h2h,totals';
const BOOKMAKERS = process.env.ODDS_API_BOOKMAKERS || '';
const CACHE_MS = Number(process.env.ODDS_API_CACHE_MS || 90_000);
const BOOKMAKER_VIEW = process.env.ODDS_BOOKMAKER_VIEW || 'kenya';

const kenyaBookmakerCatalog = [
  { key: 'sportpesa', title: 'SportPesa' },
  { key: 'betika', title: 'Betika' },
  { key: 'odibets', title: 'Odibets' },
  { key: 'mozzartbet', title: 'Mozzart Bet' },
  { key: 'betpawa', title: 'BetPawa' },
  { key: 'betway', title: 'Betway' },
  { key: 'onexbet', title: '1xBet' },
];

const kenyaBookmakerKeys = (process.env.KENYA_ODDS_API_BOOKMAKERS || kenyaBookmakerCatalog.map((book) => book.key).join(','))
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);

const cache = new Map();

const leagueKeyRules = [
  [/world cup|fifa/i, 'soccer_fifa_world_cup'],
  [/champions league/i, 'soccer_uefa_champs_league'],
  [/europa league/i, 'soccer_uefa_europa_league'],
  [/premier league|epl/i, 'soccer_epl'],
  [/championship/i, 'soccer_efl_champ'],
  [/la liga|spain/i, 'soccer_spain_la_liga'],
  [/bundesliga|germany/i, 'soccer_germany_bundesliga'],
  [/serie a|italy/i, 'soccer_italy_serie_a'],
  [/ligue 1|france/i, 'soccer_france_ligue_one'],
  [/mls|major league soccer/i, 'soccer_usa_mls'],
  [/nba/i, 'basketball_nba'],
  [/wnba/i, 'basketball_wnba'],
  [/nrl/i, 'rugbyleague_nrl'],
  [/big bash/i, 'cricket_big_bash'],
  [/test match|test matches/i, 'cricket_test_match'],
];

const sportFallbackKeys = {
  Football: 'soccer_fifa_world_cup',
  Basketball: 'basketball_nba',
  Rugby: 'rugbyleague_nrl',
  Cricket: 'cricket_test_match',
  Tennis: 'upcoming',
};

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(fc|cf|sc|afc|the|club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value) => normalize(value).split(' ').filter((token) => token.length > 1);

const nameScore = (left, right) => {
  const a = normalize(left);
  const b = normalize(right);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;

  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(leftTokens.size, rightTokens.size, 1);

  return intersection / denominator;
};

const eventScore = (event, matchInput) => {
  const direct =
    nameScore(event.home_team, matchInput.teamA) +
    nameScore(event.away_team, matchInput.teamB);
  const reversed =
    nameScore(event.home_team, matchInput.teamB) +
    nameScore(event.away_team, matchInput.teamA);

  return Math.max(direct, reversed) / 2;
};

const toIsoDateWindow = (date) => {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const formatForOddsApi = (value) => value.toISOString().replace('.000Z', 'Z');

  return {
    from: formatForOddsApi(start),
    to: formatForOddsApi(end),
  };
};

const getCached = async (key, loader) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_MS) {
    return cached.value;
  }

  const value = await loader();
  cache.set(key, { createdAt: Date.now(), value });
  return value;
};

const fetchJson = async (path, params = {}) => {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`The Odds API returned ${response.status}: ${body.slice(0, 160)}`);
    }

    const data = await response.json();
    return {
      data,
      quota: {
        remaining: response.headers.get('x-requests-remaining'),
        used: response.headers.get('x-requests-used'),
        last: response.headers.get('x-requests-last'),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const getSports = async () =>
  getCached('odds-api:sports:all', async () => {
    const { data } = await fetchJson('/v4/sports/', {
      apiKey: API_KEY,
      all: 'true',
    });
    return Array.isArray(data) ? data : [];
  });

const resolveSportKey = async (matchInput) => {
  if (process.env.ODDS_API_SPORT_KEY) {
    return {
      sportKey: process.env.ODDS_API_SPORT_KEY,
      matchedBy: 'ODDS_API_SPORT_KEY',
    };
  }

  const text = `${matchInput.league} ${matchInput.sport}`;
  const mapped = leagueKeyRules.find(([pattern]) => pattern.test(text));
  const candidateKey = mapped?.[1] || sportFallbackKeys[matchInput.sport] || 'upcoming';

  try {
    const sports = await getSports();
    const exact = sports.find((sport) => sport.key === candidateKey);
    if (exact || candidateKey === 'upcoming') {
      return {
        sportKey: candidateKey,
        sportTitle: exact?.title || candidateKey,
        matchedBy: mapped ? 'league-map' : 'sport-fallback',
      };
    }

    const leagueText = normalize(matchInput.league);
    const sportGroup = matchInput.sport === 'Football' ? 'Soccer' : matchInput.sport;
    const scored = sports
      .filter((sport) => sport.active !== false)
      .map((sport) => {
        const haystack = normalize(`${sport.key} ${sport.title} ${sport.description} ${sport.group}`);
        const groupBoost = sport.group === sportGroup ? 0.2 : 0;
        const leagueBoost = leagueText && haystack.includes(leagueText) ? 0.6 : 0;
        const tokenBoost = tokenize(matchInput.league).filter((token) => haystack.includes(token)).length * 0.08;
        return { sport, score: groupBoost + leagueBoost + tokenBoost };
      })
      .sort((a, b) => b.score - a.score);

    if (scored[0]?.score >= 0.35) {
      return {
        sportKey: scored[0].sport.key,
        sportTitle: scored[0].sport.title,
        matchedBy: 'sports-endpoint',
      };
    }
  } catch {
    // Fall back to the static key map. The odds request will surface a useful error if the key is unsupported.
  }

  return {
    sportKey: candidateKey,
    matchedBy: mapped ? 'league-map' : 'sport-fallback',
  };
};

const getMarket = (bookmaker, key) => bookmaker.markets?.find((market) => market.key === key);

const getOutcomePrice = (market, outcomeName) => {
  if (!market) return null;
  const match = market.outcomes?.find((outcome) => nameScore(outcome.name, outcomeName) >= 0.72);
  return typeof match?.price === 'number' ? match.price : null;
};

const getDrawPrice = (market) => {
  if (!market) return null;
  const match = market.outcomes?.find((outcome) => normalize(outcome.name) === 'draw');
  return typeof match?.price === 'number' ? match.price : null;
};

const getTotalsOutcome = (market, outcomeName) => {
  if (!market) return { price: null, point: null };
  const candidates = market.outcomes?.filter((outcome) => normalize(outcome.name) === normalize(outcomeName)) || [];
  if (candidates.length === 0) return { price: null, point: null };

  const withPoint = candidates
    .filter((outcome) => typeof outcome.point === 'number')
    .sort((a, b) => Math.abs(a.point - 2.5) - Math.abs(b.point - 2.5));

  const outcome = withPoint[0] || candidates[0];
  return {
    price: typeof outcome.price === 'number' ? outcome.price : null,
    point: typeof outcome.point === 'number' ? outcome.point : null,
  };
};

const getBttsPrice = (bookmaker, outcomeName) => {
  const market = getMarket(bookmaker, 'btts');
  if (!market) return null;
  const match = market.outcomes?.find((outcome) => normalize(outcome.name) === normalize(outcomeName));
  return typeof match?.price === 'number' ? match.price : null;
};

const decimalToProbability = (odds) => (typeof odds === 'number' && odds > 1 ? 100 / odds : null);

const average = (values) => {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const mergeBttsMarkets = (baseBookmakers, bttsBookmakers = []) => {
  const bttsByKey = new Map(bttsBookmakers.map((bookmaker) => [bookmaker.key, bookmaker]));

  return baseBookmakers.map((bookmaker) => {
    const bttsBookmaker = bttsByKey.get(bookmaker.key);
    return bttsBookmaker
      ? {
          ...bookmaker,
          markets: [...(bookmaker.markets || []), ...(bttsBookmaker.markets || [])],
        }
      : bookmaker;
  });
};

const emptyMarkets = () => ({
  homeWin: null,
  draw: null,
  awayWin: null,
  over25: null,
  under25: null,
  totalsLine: null,
  bttsYes: null,
  bttsNo: null,
});

const getKenyaBookmakerTitle = (key, fallbackTitle) =>
  kenyaBookmakerCatalog.find((bookmaker) => bookmaker.key === key)?.title || fallbackTitle || key;

const buildMissingKenyaRows = (returnedKeys) =>
  kenyaBookmakerKeys
    .filter((key) => !returnedKeys.has(key))
    .map((key) => ({
      bookmaker: getKenyaBookmakerTitle(key),
      key,
      lastUpdate: null,
      status: 'direct_feed_needed',
      markets: emptyMarkets(),
    }));

const toBookmakerRows = (event, bookmakers) =>
  bookmakers
    .map((bookmaker) => {
      const h2h = getMarket(bookmaker, 'h2h');
      const totals = getMarket(bookmaker, 'totals');
      const over = getTotalsOutcome(totals, 'Over');
      const under = getTotalsOutcome(totals, 'Under');

      return {
        bookmaker: bookmaker.title,
        key: bookmaker.key,
        status: 'live',
        lastUpdate: bookmaker.last_update || h2h?.last_update || totals?.last_update || null,
        markets: {
          homeWin: getOutcomePrice(h2h, event.home_team),
          draw: getDrawPrice(h2h),
          awayWin: getOutcomePrice(h2h, event.away_team),
          over25: over.price,
          under25: under.price,
          totalsLine: over.point ?? under.point,
          bttsYes: getBttsPrice(bookmaker, 'Yes'),
          bttsNo: getBttsPrice(bookmaker, 'No'),
        },
      };
    })
    .filter((row) => Object.values(row.markets).some((value) => typeof value === 'number'));

const getKenyaBookmakerRows = async ({ sportKey, event, sport }) => {
  if (BOOKMAKER_VIEW.toLowerCase() !== 'kenya') return null;

  const bookmakerParam = kenyaBookmakerKeys.join(',');
  if (!bookmakerParam) return null;

  const { data: kenyaEvent, quota } = await getCached(`kenya-bookmakers:${sportKey}:${event.id}:${bookmakerParam}:${DEFAULT_MARKETS}`, () =>
    fetchJson(`/v4/sports/${sportKey}/events/${event.id}/odds`, {
      apiKey: API_KEY,
      bookmakers: bookmakerParam,
      markets: DEFAULT_MARKETS,
      oddsFormat: 'decimal',
      dateFormat: 'iso',
    }),
  );

  let bookmakers = kenyaEvent.bookmakers || [];
  let bttsFetched = false;

  if (sport === 'Football') {
    try {
      const { data: bttsEvent } = await getCached(`kenya-btts:${sportKey}:${event.id}:${bookmakerParam}`, () =>
        fetchJson(`/v4/sports/${sportKey}/events/${event.id}/odds`, {
          apiKey: API_KEY,
          bookmakers: bookmakerParam,
          markets: 'btts',
          oddsFormat: 'decimal',
          dateFormat: 'iso',
        }),
      );
      bookmakers = mergeBttsMarkets(bookmakers, bttsEvent.bookmakers || []);
      bttsFetched = true;
    } catch {
      bttsFetched = false;
    }
  }

  const liveRows = toBookmakerRows(event, bookmakers).map((row) => ({
    ...row,
    bookmaker: getKenyaBookmakerTitle(row.key, row.bookmaker),
  }));
  const returnedKeys = new Set(liveRows.map((row) => row.key));
  const missingRows = buildMissingKenyaRows(returnedKeys);

  return {
    rows: [...liveRows, ...missingRows],
    liveRows,
    requestedBookmakers: kenyaBookmakerKeys.map((key) => getKenyaBookmakerTitle(key)).join(', '),
    returnedBookmakers: liveRows.map((row) => row.bookmaker).join(', '),
    unavailableBookmakers: missingRows.map((row) => row.bookmaker).join(', '),
    bttsFetched,
    quota,
  };
};

const getImpliedProbabilities = (rows) => {
  const home = average(rows.map((row) => decimalToProbability(row.markets.homeWin))) ?? 45;
  const draw = average(rows.map((row) => decimalToProbability(row.markets.draw))) ?? 25;
  const away = average(rows.map((row) => decimalToProbability(row.markets.awayWin))) ?? 100 - home - draw;
  const over25 = average(rows.map((row) => decimalToProbability(row.markets.over25))) ?? 50;
  const btts = average(rows.map((row) => decimalToProbability(row.markets.bttsYes))) ?? 50;

  return {
    home: Number(home.toFixed(1)),
    draw: Number(draw.toFixed(1)),
    away: Number(Math.max(1, away).toFixed(1)),
    over25: Number(over25.toFixed(1)),
    btts: Number(btts.toFixed(1)),
  };
};

const findBestEvent = (events, matchInput) =>
  events
    .map((event) => ({ event, score: eventScore(event, matchInput) }))
    .sort((a, b) => b.score - a.score)[0];

export const theOddsApiAdapter = {
  id: 'the-odds-api',
  name: 'The Odds API',
  type: 'bookmaker-odds',
  isConfigured: () => Boolean(API_KEY),
  async getOdds(matchInput) {
    if (!API_KEY) {
      throw new Error('ODDS_API_KEY is not configured.');
    }

    const { sportKey, sportTitle, matchedBy } = await resolveSportKey(matchInput);
    const { from, to } = toIsoDateWindow(matchInput.matchDate);
    const params = {
      apiKey: API_KEY,
      markets: DEFAULT_MARKETS,
      oddsFormat: 'decimal',
      dateFormat: 'iso',
      commenceTimeFrom: from,
      commenceTimeTo: to,
    };

    if (BOOKMAKERS) {
      params.bookmakers = BOOKMAKERS;
    } else {
      params.regions = DEFAULT_REGIONS;
    }

    const oddsCacheKey = `odds:${sportKey}:${matchInput.matchDate}:${matchInput.teamA}:${matchInput.teamB}:${BOOKMAKERS || DEFAULT_REGIONS}:${DEFAULT_MARKETS}`;
    const { data, quota } = await getCached(oddsCacheKey, () => fetchJson(`/v4/sports/${sportKey}/odds/`, params));
    const events = Array.isArray(data) ? data : [];
    const best = findBestEvent(events, matchInput);

    if (!best || best.score < 0.55) {
      throw new Error(`No matching real odds event found for ${matchInput.teamA} vs ${matchInput.teamB}.`);
    }

    let bookmakers = best.event.bookmakers || [];
    let bttsFetched = false;

    if (matchInput.sport === 'Football') {
      try {
        const bttsCacheKey = `btts:${sportKey}:${best.event.id}:${BOOKMAKERS || DEFAULT_REGIONS}`;
        const { data: bttsEvent } = await getCached(bttsCacheKey, () =>
          fetchJson(`/v4/sports/${sportKey}/events/${best.event.id}/odds`, {
            apiKey: API_KEY,
            markets: 'btts',
            oddsFormat: 'decimal',
            dateFormat: 'iso',
            ...(BOOKMAKERS ? { bookmakers: BOOKMAKERS } : { regions: DEFAULT_REGIONS }),
          }),
        );
        bookmakers = mergeBttsMarkets(bookmakers, bttsEvent.bookmakers || []);
        bttsFetched = true;
      } catch {
        bttsFetched = false;
      }
    }

    const globalRows = toBookmakerRows(best.event, bookmakers);
    let kenyaBookmakerView = null;

    try {
      kenyaBookmakerView = await getKenyaBookmakerRows({
        sportKey,
        event: best.event,
        sport: matchInput.sport,
      });
    } catch {
      kenyaBookmakerView = null;
    }

    const rows = kenyaBookmakerView?.liveRows?.length ? kenyaBookmakerView.rows : globalRows;

    if (globalRows.length === 0 && (!kenyaBookmakerView || kenyaBookmakerView.liveRows.length === 0)) {
      throw new Error('The matched real odds event did not include displayable bookmaker markets.');
    }

    return {
      provider: this.name,
      sourceMode: 'real-api',
      matchKey: `${matchInput.teamA}::${matchInput.teamB}::${matchInput.matchDate}`,
      impliedProbabilities: getImpliedProbabilities(rows),
      bookmakers: rows,
      fetchedAt: new Date().toISOString(),
      sportKey,
      sportTitle,
      matchedBy,
      matchedEvent: {
        id: best.event.id,
        homeTeam: best.event.home_team,
        awayTeam: best.event.away_team,
        commenceTime: best.event.commence_time,
        score: Number(best.score.toFixed(2)),
      },
      regions: kenyaBookmakerView?.liveRows?.length ? null : BOOKMAKERS ? null : DEFAULT_REGIONS,
      selectedBookmakers: BOOKMAKERS || null,
      bookmakerView: kenyaBookmakerView?.liveRows?.length ? 'kenya' : 'global',
      requestedBookmakers: kenyaBookmakerView?.requestedBookmakers || null,
      returnedBookmakers: kenyaBookmakerView?.returnedBookmakers || null,
      unavailableBookmakers: kenyaBookmakerView?.unavailableBookmakers || null,
      markets: DEFAULT_MARKETS,
      bttsFetched: kenyaBookmakerView?.liveRows?.length ? kenyaBookmakerView.bttsFetched : bttsFetched,
      quota: kenyaBookmakerView?.quota || quota,
      note: kenyaBookmakerView?.liveRows?.length
        ? 'Kenya bookmaker view: live prices are shown where The Odds API has them. SportPesa, Betika, Odibets, Mozzart Bet and BetPawa need direct partner/API feeds when no prices are returned.'
        : bttsFetched
          ? 'Real bookmaker odds returned by The Odds API. BTTS is fetched from the event odds endpoint when available.'
          : 'Real bookmaker odds returned by The Odds API. BTTS may be blank when the provider has no BTTS market for this event.',
    };
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: API_KEY ? 'online' : 'needs_config',
      mode: API_KEY ? 'real-api' : 'not-configured',
      updateCadence: API_KEY ? `Cached for ${Math.round(CACHE_MS / 1000)} seconds` : 'Set ODDS_API_KEY to enable live odds',
    };
  },
};
