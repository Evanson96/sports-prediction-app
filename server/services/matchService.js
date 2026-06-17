import { fetchTheSportsDbJson, getTheSportsDbStatus } from './providers/theSportsDbClient.js';
import {
  findApiFootballMatchByTeamsAndDate,
  getApiFootballCountries,
  getApiFootballMatchesByDate,
  getApiFootballMatchesByCountrySportAndDate,
  getApiFootballMatchProvider,
  getApiFootballSportsByCountry,
} from './matchProviders/apiFootballMatchProvider.js';
import { providerFallbackOrder } from './providerFallback.js';

const CACHE_MS = 5 * 60 * 1000;
const MAX_LEAGUES_TO_SCAN = Number(process.env.MATCH_LEAGUE_SCAN_LIMIT || 8);
const DISPLAY_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Nairobi';
const TODAY_MATCH_LIMIT = Number(process.env.TODAY_MATCH_LIMIT || 60);
const TODAY_FALLBACK_SCAN_LIMIT = Number(process.env.TODAY_FALLBACK_SCAN_LIMIT || 12);
const TODAY_FALLBACK_COUNTRIES = (process.env.TODAY_FALLBACK_COUNTRIES || 'International,Kenya,England,Spain,Germany,Italy,France,South Africa,Nigeria,USA,Brazil')
  .split(',')
  .map((country) => country.trim())
  .filter(Boolean);

const supportedCountries = [
  { country: 'International', apiCountry: 'International', isGlobal: true },
  { country: 'Kenya', apiCountry: 'Kenya' },
  { country: 'England', apiCountry: 'England' },
  { country: 'Spain', apiCountry: 'Spain' },
  { country: 'Germany', apiCountry: 'Germany' },
  { country: 'Italy', apiCountry: 'Italy' },
  { country: 'France', apiCountry: 'France' },
  { country: 'South Africa', apiCountry: 'South Africa' },
  { country: 'Nigeria', apiCountry: 'Nigeria' },
  { country: 'USA', apiCountry: 'United States' },
  { country: 'Brazil', apiCountry: 'Brazil' },
  { country: 'Argentina', apiCountry: 'Argentina' },
  { country: 'Australia', apiCountry: 'Australia' },
  { country: 'Belgium', apiCountry: 'Belgium' },
  { country: 'Canada', apiCountry: 'Canada' },
  { country: 'Egypt', apiCountry: 'Egypt' },
  { country: 'Ghana', apiCountry: 'Ghana' },
  { country: 'Japan', apiCountry: 'Japan' },
  { country: 'Mexico', apiCountry: 'Mexico' },
  { country: 'Morocco', apiCountry: 'Morocco' },
  { country: 'Netherlands', apiCountry: 'Netherlands' },
  { country: 'Portugal', apiCountry: 'Portugal' },
  { country: 'Saudi Arabia', apiCountry: 'Saudi Arabia' },
  { country: 'Scotland', apiCountry: 'Scotland' },
  { country: 'Tanzania', apiCountry: 'Tanzania' },
  { country: 'Turkey', apiCountry: 'Turkey' },
  { country: 'Uganda', apiCountry: 'Uganda' },
];

const sports = [
  { sport: 'Football', apiSport: 'Soccer' },
  { sport: 'Basketball', apiSport: 'Basketball' },
  { sport: 'Rugby', apiSport: 'Rugby' },
  { sport: 'Tennis', apiSport: 'Tennis' },
  { sport: 'Cricket', apiSport: 'Cricket' },
];

const preferredLeagueIds = {
  'International:Football': ['4429', '4480', '4481'],
  'International:Basketball': ['4891'],
  'International:Tennis': ['4464', '4517', '5872'],
  'International:Cricket': ['4461', '5176'],
  'International:Rugby': ['4416', '5169'],
  'Kenya:Football': ['4745'],
  'England:Football': ['4328', '4329', '4330', '4570'],
  'Spain:Football': ['4335', '4483'],
  'Germany:Football': ['4331', '4332'],
  'Italy:Football': ['4332', '4333'],
  'France:Football': ['4334'],
  'South Africa:Football': ['4584'],
  'USA:Football': ['4346', '4521'],
  'USA:Basketball': ['4387', '4516', '4388'],
  'Brazil:Football': ['4351'],
};

const globalCompetitionLeagues = {
  Football: [
    { idLeague: '4429', strLeague: 'FIFA World Cup', strSport: 'Soccer', strCountry: 'Worldwide', intDivision: '99' },
    { idLeague: '4480', strLeague: 'UEFA Champions League', strSport: 'Soccer', strCountry: 'Europe', intDivision: '99' },
    { idLeague: '4481', strLeague: 'UEFA Europa League', strSport: 'Soccer', strCountry: 'Europe', intDivision: '99' },
  ],
  Basketball: [
    { idLeague: '4891', strLeague: 'FIBA Womens World Cup', strSport: 'Basketball', strCountry: 'Worldwide', intDivision: '99' },
  ],
  Tennis: [
    { idLeague: '4464', strLeague: 'ATP World Tour', strSport: 'Tennis', strCountry: 'Worldwide', intDivision: '0' },
    { idLeague: '4517', strLeague: 'WTA Tour', strSport: 'Tennis', strCountry: 'Worldwide', intDivision: '0' },
    { idLeague: '5872', strLeague: 'United Cup', strSport: 'Tennis', strCountry: 'International', intDivision: '99' },
  ],
  Cricket: [
    { idLeague: '4461', strLeague: 'Australian Big Bash League', strSport: 'Cricket', strCountry: 'Australia', intDivision: '0' },
    { idLeague: '5176', strLeague: 'Caribbean Premier League', strSport: 'Cricket', strCountry: 'International', intDivision: '1' },
  ],
  Rugby: [
    { idLeague: '4416', strLeague: 'Australian National Rugby League', strSport: 'Rugby', strCountry: 'Australia', intDivision: '0' },
    { idLeague: '5169', strLeague: 'Super Rugby Americas', strSport: 'Rugby', strCountry: 'International', intDivision: '1' },
  ],
};

const cache = new Map();

const getCached = async (key, loader) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_MS) {
    return cached.value;
  }

  const value = await loader();
  cache.set(key, { createdAt: Date.now(), value });
  return value;
};

const provider = {
  name: 'Provider fallback stack',
  mode: getApiFootballMatchProvider().mode === 'real-api' ? 'api-football-first' : getTheSportsDbStatus().mode,
  url: 'https://www.api-football.com',
  fallbackOrder: providerFallbackOrder,
};

const findCountry = (country) => {
  const requestedCountry = String(country || '').trim();
  if (!requestedCountry) return null;

  const configuredCountry = supportedCountries.find(
    (item) =>
      item.country.toLowerCase() === requestedCountry.toLowerCase() ||
      item.apiCountry.toLowerCase() === requestedCountry.toLowerCase(),
  );

  return configuredCountry || {
    country: displayCountryName(requestedCountry),
    apiCountry: apiCountryName(requestedCountry),
  };
};

const findSport = (sport) =>
  sports.find((item) => item.sport.toLowerCase() === String(sport).toLowerCase());

const fetchJson = (path, params = {}) =>
  fetchTheSportsDbJson(path, params, {
    cacheKey: `${path}:${JSON.stringify(params)}`,
  });

const sortLeagues = (leagues, country, sport) => {
  const preferred = preferredLeagueIds[`${country}:${sport}`] || [];
  const preferredIndex = (id) => {
    const index = preferred.indexOf(String(id));
    return index === -1 ? 999 : index;
  };

  return [...leagues].sort((a, b) => {
    const aPreferred = preferredIndex(a.idLeague);
    const bPreferred = preferredIndex(b.idLeague);
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;

    const aDivision = Number(a.intDivision ?? 99);
    const bDivision = Number(b.intDivision ?? 99);
    return aDivision - bDivision;
  });
};

const displayCountryName = (apiCountry) => (apiCountry === 'United States' ? 'USA' : apiCountry);

const apiCountryName = (country) => (String(country).toLowerCase() === 'usa' ? 'United States' : country);

const getFeaturedCountryIndex = (country) => {
  const index = supportedCountries.findIndex(
    (item) => item.country === country || displayCountryName(item.apiCountry) === country,
  );
  return index === -1 ? 999 : index;
};

const getProviderCountries = async () =>
  getCached('countries:all', async () => {
    const data = await fetchJson('all_countries.php');
    const rows = Array.isArray(data.countries) ? data.countries : [];

    return rows
      .map((row) => row.name_en || row.strCountry || row.country || row.name)
      .filter(Boolean);
  });

const getLeaguesForCountrySport = async (country, sport) => {
  const countryConfig = findCountry(country);
  const sportConfig = findSport(sport);

  if (!countryConfig || !sportConfig) return [];

  if (countryConfig.isGlobal) {
    const directGlobalLeagues = globalCompetitionLeagues[sportConfig.sport] || [];
    let searchedGlobalLeagues = [];

    try {
      searchedGlobalLeagues = await getCached(`leagues:International:${sportConfig.apiSport}`, async () => {
        const data = await fetchJson('search_all_leagues.php', {
          c: 'International',
          s: sportConfig.apiSport,
        });
        return Array.isArray(data.countries) ? data.countries : [];
      });
    } catch {
      searchedGlobalLeagues = [];
    }

    const merged = new Map();
    [...directGlobalLeagues, ...searchedGlobalLeagues].forEach((league) => {
      merged.set(String(league.idLeague), league);
    });

    return [...merged.values()];
  }

  const key = `leagues:${countryConfig.apiCountry}:${sportConfig.apiSport}`;

  return getCached(key, async () => {
    const data = await fetchJson('search_all_leagues.php', {
      c: countryConfig.apiCountry,
      s: sportConfig.apiSport,
    });
    return Array.isArray(data.countries) ? data.countries : [];
  });
};

const getEventsForDate = async (date, sportConfig) => {
  const key = `eventsday:${date}:${sportConfig.apiSport}`;

  return getCached(key, async () => {
    const data = await fetchJson('eventsday.php', {
      d: date,
      s: sportConfig.apiSport,
    });
    return Array.isArray(data.events) ? data.events : [];
  });
};

const shiftDate = (date, days) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getEventsForDateWindow = async (date, sportConfig) => {
  const dates = [shiftDate(date, -1), date, shiftDate(date, 1)];
  const eventGroups = await Promise.all(dates.map((item) => getEventsForDate(item, sportConfig).catch(() => [])));
  const uniqueEvents = new Map();

  eventGroups.flat().forEach((event) => {
    if (event?.idEvent) {
      uniqueEvents.set(event.idEvent, event);
    }
  });

  return [...uniqueEvents.values()];
};

const getKenyaDateTime = (event) => {
  const timestamp = event.strTimestamp || (event.dateEvent && event.strTime ? `${event.dateEvent}T${event.strTime}` : '');
  if (!timestamp) return null;

  const date = new Date(timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((values, part) => ({ ...values, [part.type]: part.value }), {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
};

const normalizeSelectionCountry = (value) =>
  displayCountryName(value || '')
    .toLowerCase()
    .trim();

const normalizeTeamName = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(fc|cf|sc|afc|the|club|sporting)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const teamNameScore = (left, right) => {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;

  const leftTokens = new Set(a.split(' ').filter((token) => token.length > 1));
  const rightTokens = new Set(b.split(' ').filter((token) => token.length > 1));
  const hits = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return hits / Math.max(leftTokens.size, rightTokens.size, 1);
};

const matchSearchScore = (match, teamA, teamB) => {
  const direct = (teamNameScore(match.teamA, teamA) + teamNameScore(match.teamB, teamB)) / 2;
  const reversed = (teamNameScore(match.teamA, teamB) + teamNameScore(match.teamB, teamA)) / 2;
  return Math.max(direct, reversed);
};

const globalCompetitionPattern =
  /world cup|champions league|europa league|fifa|uefa|afcon|africa cup|copa|international/i;

const eventBelongsToSelection = (event, countryConfig, leagueIds) => {
  const eventLeagueId = String(event.idLeague || '');
  const eventCountry = normalizeSelectionCountry(event.strCountry);

  if (countryConfig.isGlobal) {
    return (
      leagueIds.has(eventLeagueId) ||
      ['worldwide', 'international', 'europe'].includes(eventCountry) ||
      globalCompetitionPattern.test(event.strLeague || '')
    );
  }

  const selectedCountries = new Set(
    [countryConfig.country, countryConfig.apiCountry, displayCountryName(countryConfig.apiCountry)]
      .filter(Boolean)
      .map(normalizeSelectionCountry),
  );

  return selectedCountries.has(eventCountry) || leagueIds.has(eventLeagueId);
};

const mapStatus = (event) => {
  const raw = event.strStatus || '';
  const lower = raw.toLowerCase();

  if (lower === 'live' || lower === 'in play') return 'Live';
  if (lower === 'ft' || lower === 'finished' || event.intHomeScore !== null || event.intAwayScore !== null) return 'Finished';
  return 'Upcoming';
};

const mapEvent = (event, fallbackCountry, selectedSport) => {
  const kenyaDateTime = getKenyaDateTime(event);
  const date = kenyaDateTime?.date || event.dateEvent || event.dateEventLocal || '';
  const kickoffTime = kenyaDateTime?.time || (event.strTime ? event.strTime.slice(0, 5) : event.strTimeLocal?.slice(0, 5)) || 'TBA';
  const country = event.strCountry === 'United States' ? 'USA' : event.strCountry || fallbackCountry;
  const sport = event.strSport === 'Soccer' ? 'Football' : event.strSport || selectedSport;

  return {
    id: event.idEvent,
    provider: provider.name,
    country,
    sport,
    teamA: event.strHomeTeam || 'Home Team',
    teamB: event.strAwayTeam || 'Away Team',
    league: event.strLeague || 'Unknown League',
    matchDate: date,
    kickoffTime,
    venue: event.strVenue || 'Venue TBA',
    status: mapStatus(event),
    source: provider.name,
  };
};

const isUpcoming = (match) => {
  if (!match.matchDate) return false;
  const eventTime = Date.parse(`${match.matchDate}T${match.kickoffTime === 'TBA' ? '00:00' : match.kickoffTime}`);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return Number.isNaN(eventTime) ? true : eventTime >= todayStart.getTime();
};

export const getCountries = async () => {
  const merged = new Map();

  supportedCountries.forEach((item) => {
    merged.set(item.country, item);
  });

  try {
    const apiFootballCountries = await getApiFootballCountries();
    apiFootballCountries.forEach((item) => {
      if (!merged.has(item.country)) {
        merged.set(item.country, { country: item.country, apiCountry: item.country });
      }
    });
  } catch {
    // API-Football is first in production, but TheSportsDB and curated countries keep the browse flow available.
  }

  try {
    const providerCountries = await getProviderCountries();
    providerCountries.forEach((apiCountry) => {
      const country = displayCountryName(apiCountry);
      if (!merged.has(country)) {
        merged.set(country, { country, apiCountry });
      }
    });
  } catch {
    // The curated list above keeps the app useful when the live country endpoint is unavailable.
  }

  return [...merged.values()]
    .sort((a, b) => {
      const aIndex = getFeaturedCountryIndex(a.country);
      const bIndex = getFeaturedCountryIndex(b.country);
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.country.localeCompare(b.country);
    })
    .map(({ country }) => ({
      country,
      matchCount: null,
      provider: provider.name,
    }));
};

export const getSportsByCountry = async (country) => {
  const countryConfig = findCountry(country);
  if (!countryConfig) return [];

  let apiFootballSports = [];

  try {
    apiFootballSports = await getApiFootballSportsByCountry(countryConfig.country);
  } catch {
    apiFootballSports = [];
  }

  if (countryConfig.isGlobal) {
    const globalSports = sports
      .map(({ sport }) => ({
        sport,
        leagueCount: globalCompetitionLeagues[sport]?.length || 0,
        provider: provider.name,
      }))
      .filter((item) => item.leagueCount > 0);

    const merged = new Map(globalSports.map((item) => [item.sport, item]));
    apiFootballSports.forEach((item) => merged.set(item.sport, item));
    return [...merged.values()];
  }

  const sportChecks = await Promise.all(
    sports.map(async ({ sport }) => {
      let leagues = [];
      try {
        leagues = await getLeaguesForCountrySport(countryConfig.country, sport);
      } catch {
        leagues = [];
      }
      return {
        sport,
        leagueCount: leagues.length,
        provider: provider.name,
      };
    }),
  );

  const merged = new Map(sportChecks.filter((item) => item.leagueCount > 0).map((item) => [item.sport, item]));
  apiFootballSports.forEach((item) => merged.set(item.sport, item));
  return [...merged.values()];
};

export const getMatchesByCountryAndSport = async (country, sport) => {
  const countryConfig = findCountry(country);
  const sportConfig = findSport(sport);

  if (!countryConfig || !sportConfig) return [];

  let leagues = [];
  try {
    leagues = await getLeaguesForCountrySport(countryConfig.country, sportConfig.sport);
  } catch {
    leagues = [];
  }
  const sortedLeagues = sortLeagues(leagues, countryConfig.country, sportConfig.sport).slice(0, MAX_LEAGUES_TO_SCAN);
  return getMatchesFromLeagues(countryConfig, sportConfig, sortedLeagues);
};

export const getMatchesByCountrySportAndDate = async (country, sport, date) => {
  const countryConfig = findCountry(country);
  const sportConfig = findSport(sport);

  if (!countryConfig || !sportConfig) return [];

  if (sportConfig.sport === 'Football') {
    try {
      const apiFootballMatches = await getApiFootballMatchesByCountrySportAndDate(countryConfig.country, sportConfig.sport, date);
      if (apiFootballMatches.length > 0) {
        return apiFootballMatches;
      }
    } catch {
      // Fall back to TheSportsDB when API-Football is not connected or has no free-tier data for this query.
    }
  }

  let leagues = [];
  try {
    leagues = await getLeaguesForCountrySport(countryConfig.country, sportConfig.sport);
  } catch {
    leagues = [];
  }
  const sortedLeagues = sortLeagues(leagues, countryConfig.country, sportConfig.sport).slice(0, MAX_LEAGUES_TO_SCAN);
  const allLeagueIds = new Set(leagues.map((league) => String(league.idLeague)));
  const scannedLeagueIds = new Set(sortedLeagues.map((league) => String(league.idLeague)));
  const key = `matches:v2:${countryConfig.country}:${sportConfig.sport}:${date}:${leagues.length}:${[...scannedLeagueIds].join(',')}`;

  return getCached(key, async () => {
    const [dateEvents, leagueEventGroups] = await Promise.all([
      getEventsForDateWindow(date, sportConfig),
      Promise.all(
        sortedLeagues.map(async (league) => {
          try {
            const data = await fetchJson('eventsnextleague.php', { id: league.idLeague });
            return Array.isArray(data.events) ? data.events : [];
          } catch {
            return [];
          }
        }),
      ),
    ]);

    const uniqueMatches = new Map();

    [
      ...dateEvents.filter((event) => eventBelongsToSelection(event, countryConfig, allLeagueIds)),
      ...leagueEventGroups.flat().filter((event) => scannedLeagueIds.has(String(event.idLeague))),
    ]
      .map((event) => mapEvent(event, countryConfig.country, sportConfig.sport))
      .filter((match) => match.matchDate === date)
      .filter(isUpcoming)
      .forEach((match) => {
        uniqueMatches.set(match.id, match);
      });

    return sortMatches([...uniqueMatches.values()]);
  });
};

export const findMatchByTeamsAndDate = async ({ teamA, teamB, matchDate }) => {
  try {
    const apiFootballMatch = await findApiFootballMatchByTeamsAndDate({ teamA, teamB, matchDate });
    if (apiFootballMatch) return apiFootballMatch;
  } catch {
    // TheSportsDB fallback below keeps manual search usable when API-Football is unavailable.
  }

  const matchGroups = await Promise.all(
    sports.map(async (sportConfig) => {
      try {
        const events = await getEventsForDateWindow(matchDate, sportConfig);
        return events
          .map((event) => mapEvent(event, event.strCountry || 'International', sportConfig.sport))
          .filter((match) => match.matchDate === matchDate)
          .map((match) => ({
            match,
            score: matchSearchScore(match, teamA, teamB),
          }));
      } catch {
        return [];
      }
    }),
  );

  const best = matchGroups
    .flat()
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 0.62) {
    return null;
  }

  return {
    ...best.match,
    matchScore: Number(best.score.toFixed(2)),
  };
};

const todayMatchKey = (match) =>
  [
    match.id,
    normalizeTeamName(match.teamA),
    normalizeTeamName(match.teamB),
    match.matchDate,
    match.kickoffTime,
  ]
    .filter(Boolean)
    .join(':');

export const getTodayAvailableMatches = async ({ date, sport = 'Football', limit = TODAY_MATCH_LIMIT } = {}) => {
  const requestedSport = sport === 'All' ? 'All' : findSport(sport)?.sport || 'Football';
  const unique = new Map();
  const attempts = [];

  if (requestedSport === 'Football' || requestedSport === 'All') {
    try {
      const apiFootballMatches = await getApiFootballMatchesByDate(date);
      apiFootballMatches.forEach((match) => unique.set(todayMatchKey(match), match));
      attempts.push({
        provider: 'API-Football',
        status: apiFootballMatches.length ? 'used' : 'no_data',
        count: apiFootballMatches.length,
      });
    } catch (error) {
      attempts.push({
        provider: 'API-Football',
        status: error.providerStatus || 'failed',
        reason: error.message,
      });
    }
  }

  const shouldUseFallback = unique.size === 0 || requestedSport === 'All';
  if (shouldUseFallback) {
    const fallbackSports = requestedSport === 'All' ? sports.map((item) => item.sport) : [requestedSport];
    const fallbackQueries = [];

    for (const country of TODAY_FALLBACK_COUNTRIES) {
      for (const item of fallbackSports) {
        fallbackQueries.push({ country, sport: item });
      }
    }

    const selectedQueries = fallbackQueries.slice(0, TODAY_FALLBACK_SCAN_LIMIT);
    const groups = await Promise.all(
      selectedQueries.map(async ({ country, sport: item }) => {
        try {
          const rows = await getMatchesByCountrySportAndDate(country, item, date);
          return {
            provider: 'Provider fallback stack',
            country,
            sport: item,
            status: rows.length ? 'used' : 'no_data',
            rows,
          };
        } catch (error) {
          return {
            provider: 'Provider fallback stack',
            country,
            sport: item,
            status: 'failed',
            reason: error.message,
            rows: [],
          };
        }
      }),
    );

    groups.forEach((group) => {
      attempts.push({
        provider: group.provider,
        country: group.country,
        sport: group.sport,
        status: group.status,
        count: group.rows.length,
        reason: group.reason,
      });

      group.rows
        .filter((match) => match.status !== 'Finished')
        .forEach((match) => unique.set(todayMatchKey(match), match));
    });
  }

  const matches = sortMatches([...unique.values()]).slice(0, limit);

  return {
    provider,
    date,
    sport: requestedSport,
    matches,
    totalAvailable: unique.size,
    returned: matches.length,
    limit,
    providerAttempts: attempts,
    fetchedAt: new Date().toISOString(),
    note:
      unique.size > matches.length
        ? `Fetched ${unique.size} real fixture records and returned the first ${matches.length} to protect free-provider limits.`
        : 'Today fixture list is built from connected providers only; no missing fixtures are invented.',
  };
};

const sortMatches = (matches) =>
  matches.sort((a, b) => {
    const aTime = Date.parse(`${a.matchDate}T${a.kickoffTime === 'TBA' ? '00:00' : a.kickoffTime}`);
    const bTime = Date.parse(`${b.matchDate}T${b.kickoffTime === 'TBA' ? '00:00' : b.kickoffTime}`);
    return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
  });

const getMatchesFromLeagues = async (countryConfig, sportConfig, sortedLeagues) => {
  const key = `matches:${countryConfig.country}:${sportConfig.sport}:next:${sortedLeagues.map((league) => league.idLeague).join(',')}`;

  return getCached(key, async () => {
    const eventGroups = await Promise.all(
      sortedLeagues.map(async (league) => {
        try {
          const data = await fetchJson('eventsnextleague.php', { id: league.idLeague });
          return Array.isArray(data.events) ? data.events : [];
        } catch {
          return [];
        }
      }),
    );

    const uniqueMatches = new Map();
    eventGroups
      .flat()
      .map((event) => mapEvent(event, countryConfig.country, sportConfig.sport))
      .filter(isUpcoming)
      .forEach((match) => {
        uniqueMatches.set(match.id, match);
      });

    return sortMatches([...uniqueMatches.values()]);
  });
};

export const getMatchProvider = () => provider;
