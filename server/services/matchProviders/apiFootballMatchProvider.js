import { fetchApiFootballJson, getApiFootballSeason, getApiFootballStatus, isApiFootballConfigured } from '../providers/apiFootballClient.js';
import { nameScore, normalizeName } from '../../utils/normalize.js';

const DISPLAY_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Nairobi';
const LEAGUE_SCAN_LIMIT = Number(process.env.API_FOOTBALL_LEAGUE_SCAN_LIMIT || 5);

const countryAliases = {
  International: 'World',
  USA: 'USA',
  England: 'England',
  Scotland: 'Scotland',
  'South Africa': 'South-Africa',
};

const toApiCountry = (country) => countryAliases[country] || country;

const mapStatus = (status = {}) => {
  const short = String(status.short || '').toUpperCase();
  const long = String(status.long || '').toLowerCase();

  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short) || long.includes('live')) return 'Live';
  if (['FT', 'AET', 'PEN'].includes(short) || long.includes('match finished')) return 'Finished';
  return 'Upcoming';
};

const getKenyaDateTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: '', time: 'TBA' };

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

const mapFixture = (row, fallbackCountry = 'International') => {
  const kenyaDateTime = getKenyaDateTime(row.fixture?.date);
  const venueParts = [row.fixture?.venue?.name, row.fixture?.venue?.city].filter(Boolean);

  return {
    id: `api-football-${row.fixture?.id}`,
    provider: 'API-Football',
    providerFixtureId: row.fixture?.id || null,
    providerLeagueId: row.league?.id || null,
    providerSeason: row.league?.season || null,
    providerHomeTeamId: row.teams?.home?.id || null,
    providerAwayTeamId: row.teams?.away?.id || null,
    homeLogo: row.teams?.home?.logo || null,
    awayLogo: row.teams?.away?.logo || null,
    country: row.league?.country || fallbackCountry,
    sport: 'Football',
    teamA: row.teams?.home?.name || 'Home Team',
    teamB: row.teams?.away?.name || 'Away Team',
    league: row.league?.name || 'Unknown League',
    matchDate: kenyaDateTime.date,
    kickoffTime: kenyaDateTime.time,
    venue: venueParts.join(', ') || 'Venue TBA',
    status: mapStatus(row.fixture?.status),
    source: 'API-Football',
  };
};

const sortMatches = (matches) =>
  matches.sort((a, b) => {
    const aTime = Date.parse(`${a.matchDate}T${a.kickoffTime === 'TBA' ? '00:00' : a.kickoffTime}`);
    const bTime = Date.parse(`${b.matchDate}T${b.kickoffTime === 'TBA' ? '00:00' : b.kickoffTime}`);
    return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
  });

const globalCompetitionPattern =
  /world cup|champions league|europa league|fifa|uefa|afcon|africa cup|copa|international/i;

const fixtureBelongsToCountry = (row, country) => {
  const leagueCountry = normalizeName(row.league?.country);
  const leagueName = row.league?.name || '';
  const requested = normalizeName(toApiCountry(country));

  if (country === 'International') {
    return ['world', 'international', 'europe'].includes(leagueCountry) || globalCompetitionPattern.test(leagueName);
  }

  return leagueCountry === requested || normalizeName(row.league?.country) === normalizeName(country);
};

const getFixturesByDate = async (date) => {
  const data = await fetchApiFootballJson(
    'fixtures',
    { date, timezone: DISPLAY_TIMEZONE },
    { cacheKey: `api-football:fixtures:date:${date}:${DISPLAY_TIMEZONE}` },
  );
  return Array.isArray(data.response) ? data.response : [];
};

const fixtureSearchScore = (match, teamA, teamB) => {
  const direct = (nameScore(match.teamA, teamA) + nameScore(match.teamB, teamB)) / 2;
  const reversed = (nameScore(match.teamA, teamB) + nameScore(match.teamB, teamA)) / 2;
  return Math.max(direct, reversed);
};

export const getApiFootballCountries = async () => {
  if (!isApiFootballConfigured()) return [];

  const data = await fetchApiFootballJson('countries', {}, { cacheKey: 'api-football:countries' });
  const rows = Array.isArray(data.response) ? data.response : [];

  return rows
    .map((row) => row.name)
    .filter(Boolean)
    .map((country) => ({
      country: country === 'World' ? 'International' : country,
      matchCount: null,
      provider: 'API-Football',
    }));
};

export const getApiFootballLeaguesByCountry = async (country, date = new Date().toISOString().slice(0, 10)) => {
  if (!isApiFootballConfigured()) return [];

  const season = getApiFootballSeason(date);
  const apiCountry = toApiCountry(country);
  const data = await fetchApiFootballJson(
    'leagues',
    { country: apiCountry, season },
    { cacheKey: `api-football:leagues:${apiCountry}:${season}` },
  );
  const rows = Array.isArray(data.response) ? data.response : [];

  return rows
    .filter((row) => row.league?.id)
    .map((row) => ({
      id: row.league.id,
      name: row.league.name,
      country: row.country?.name || country,
      logo: row.league.logo || null,
      season,
    }));
};

export const getApiFootballSportsByCountry = async (country) => {
  const leagues = await getApiFootballLeaguesByCountry(country);

  if (!leagues.length) return [];

  return [
    {
      sport: 'Football',
      leagueCount: leagues.length,
      provider: 'API-Football',
    },
  ];
};

export const getApiFootballMatchesByCountrySportAndDate = async (country, sport, date) => {
  if (sport !== 'Football' || !isApiFootballConfigured()) return [];

  try {
    const dateRows = await getFixturesByDate(date);
    const dateMatches = dateRows
      .filter((row) => fixtureBelongsToCountry(row, country))
      .map((row) => mapFixture(row, country))
      .filter((match) => match.matchDate === date);

    if (dateMatches.length > 0) {
      const unique = new Map(dateMatches.map((match) => [match.id, match]));
      return sortMatches([...unique.values()]);
    }
  } catch {
    // Some API-Football plans restrict direct fixture search; fall back to league scanning below.
  }

  const leagues = await getApiFootballLeaguesByCountry(country, date);
  const selectedLeagues = leagues.slice(0, LEAGUE_SCAN_LIMIT);
  const eventGroups = await Promise.all(
    selectedLeagues.map(async (league) => {
      try {
        const data = await fetchApiFootballJson(
          'fixtures',
          {
            league: league.id,
            season: league.season,
            date,
            timezone: DISPLAY_TIMEZONE,
          },
          { cacheKey: `api-football:fixtures:${league.id}:${league.season}:${date}` },
        );
        return Array.isArray(data.response) ? data.response : [];
      } catch {
        return [];
      }
    }),
  );

  const unique = new Map();
  eventGroups
    .flat()
    .map((row) => mapFixture(row, country))
    .filter((match) => match.matchDate === date)
    .forEach((match) => {
      unique.set(match.id, match);
    });

  return sortMatches([...unique.values()]);
};

export const getApiFootballMatchesByDate = async (date) => {
  if (!isApiFootballConfigured()) return [];

  const rows = await getFixturesByDate(date);
  const unique = new Map();

  rows
    .map((row) => mapFixture(row, row.league?.country || 'International'))
    .filter((match) => match.matchDate === date && match.status !== 'Finished')
    .forEach((match) => {
      unique.set(match.id, match);
    });

  return sortMatches([...unique.values()]);
};

export const findApiFootballMatchByTeamsAndDate = async ({ teamA, teamB, matchDate }) => {
  if (!isApiFootballConfigured()) return null;

  const rows = await getFixturesByDate(matchDate);
  const best = rows
    .map((row) => mapFixture(row, row.league?.country || 'International'))
    .map((match) => ({
      match,
      score: fixtureSearchScore(match, teamA, teamB),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 0.62) return null;

  return {
    ...best.match,
    matchScore: Number(best.score.toFixed(2)),
  };
};

export const getApiFootballMatchProviderStatus = () => getApiFootballStatus();

export const getApiFootballMatchProvider = () => ({
  name: 'API-Football',
  mode: isApiFootballConfigured() ? 'real-api' : 'provider-not-connected',
  url: 'https://www.api-football.com',
});

export const apiFootballHasCountry = (country) => Boolean(normalizeName(country));
