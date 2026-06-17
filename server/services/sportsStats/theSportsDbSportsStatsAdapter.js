import { getMatchesByCountrySportAndDate } from '../matchService.js';
import { fetchTheSportsDbJson, getTheSportsDbStatus, isTheSportsDbConfigured } from '../providers/theSportsDbClient.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const nameScore = (left, right) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const leftTokens = new Set(a.split(' ').filter((token) => token.length > 1));
  const rightTokens = new Set(b.split(' ').filter((token) => token.length > 1));
  const hits = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return hits / Math.max(leftTokens.size, rightTokens.size, 1);
};

const searchTeam = async (teamName) => {
  try {
    const data = await fetchTheSportsDbJson(
      'searchteams.php',
      { t: teamName },
      { cacheKey: `team-search:${normalize(teamName)}` },
    );
    const teams = Array.isArray(data.teams) ? data.teams : [];
    return teams
      .map((team) => ({
        team,
        score: Math.max(nameScore(team.strTeam, teamName), nameScore(team.strAlternate, teamName)),
      }))
      .sort((a, b) => b.score - a.score)[0]?.team || null;
  } catch {
    return null;
  }
};

const getLastEvents = async (teamId) => {
  if (!teamId) return [];

  try {
    const data = await fetchTheSportsDbJson(
      'eventslast.php',
      { id: teamId },
      { cacheKey: `team-last-events:${teamId}` },
    );
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
};

const getH2hEvents = async (teamA, teamB) => {
  try {
    const data = await fetchTheSportsDbJson(
      'eventsh2h.php',
      { first: teamA, second: teamB },
      { cacheKey: `h2h:${normalize(teamA)}:${normalize(teamB)}` },
    );
    return Array.isArray(data.event) ? data.event : [];
  } catch {
    return [];
  }
};

const resultForTeam = (event, teamName) => {
  const homeScore = Number(event.intHomeScore);
  const awayScore = Number(event.intAwayScore);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }

  const isHome = nameScore(event.strHomeTeam, teamName) >= nameScore(event.strAwayTeam, teamName);
  const goalsFor = isHome ? homeScore : awayScore;
  const goalsAgainst = isHome ? awayScore : homeScore;

  return {
    result: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L',
    goalsFor,
    goalsAgainst,
    isHome,
  };
};

const getFormScore = (form) => {
  if (!form.length) return null;
  const points = form.reduce((total, result) => {
    if (result === 'W') return total + 3;
    if (result === 'D') return total + 1;
    return total;
  }, 0);

  return Math.round((points / (form.length * 3)) * 100);
};

const buildTeamProfile = ({ requestedName, team, events }) => {
  const results = events.map((event) => resultForTeam(event, team?.strTeam || requestedName)).filter(Boolean);
  const form = results.slice(0, 5).map((result) => result.result);
  const formScore = getFormScore(form);
  const goalDiffAverage = results.length
    ? results.reduce((sum, result) => sum + result.goalsFor - result.goalsAgainst, 0) / results.length
    : 0;
  const homeResults = results.filter((result) => result.isHome);
  const awayResults = results.filter((result) => !result.isHome);

  return {
    name: team?.strTeam || requestedName,
    providerId: team?.idTeam || null,
    logo: team?.strBadge || team?.strLogo || null,
    country: team?.strCountry || null,
    form,
    formScore: formScore ?? 50,
    rating: Math.round(clamp(48 + (formScore ?? 50) * 0.45 + goalDiffAverage * 8, 35, 88)),
    homeStrength: Math.round(clamp(50 + (getFormScore(homeResults.map((result) => result.result)) ?? formScore ?? 50) * 0.45, 40, 90)),
    awayStrength: Math.round(clamp(48 + (getFormScore(awayResults.map((result) => result.result)) ?? formScore ?? 50) * 0.42, 35, 88)),
    ranking: null,
    sourceEvents: results.length,
  };
};

const buildLeagueProfile = (events) => {
  const scoredEvents = events
    .map((event) => ({
      home: Number(event.intHomeScore),
      away: Number(event.intAwayScore),
    }))
    .filter((event) => Number.isFinite(event.home) && Number.isFinite(event.away));

  if (!scoredEvents.length) {
    return {
      averageGoals: 2.45,
      drawRate: 25,
      homeAdvantage: 4,
      source: 'neutral-estimate',
    };
  }

  const averageGoals = scoredEvents.reduce((sum, event) => sum + event.home + event.away, 0) / scoredEvents.length;
  const drawRate = (scoredEvents.filter((event) => event.home === event.away).length / scoredEvents.length) * 100;
  const homeAdvantage = scoredEvents.reduce((sum, event) => sum + event.home - event.away, 0) / scoredEvents.length;

  return {
    averageGoals: Number(averageGoals.toFixed(2)),
    drawRate: Math.round(drawRate),
    homeAdvantage: Math.round(homeAdvantage * 4),
    source: 'recent-real-results',
  };
};

const buildH2h = ({ events, teamA }) => {
  const results = events.map((event) => resultForTeam(event, teamA)).filter(Boolean);
  if (!results.length) {
    return {
      meetings: [],
      teamAEdge: 50,
      drawLikelihood: 25,
      source: 'missing',
    };
  }

  const teamAPoints = results.reduce((sum, result) => sum + (result.result === 'W' ? 3 : result.result === 'D' ? 1 : 0), 0);
  const teamAEdge = Math.round((teamAPoints / (results.length * 3)) * 100);
  const drawLikelihood = Math.round((results.filter((result) => result.result === 'D').length / results.length) * 100);

  return {
    meetings: events.slice(0, 5).map((event) => ({
      date: event.dateEvent,
      home: event.strHomeTeam,
      away: event.strAwayTeam,
      score: `${event.intHomeScore ?? '-'}-${event.intAwayScore ?? '-'}`,
    })),
    teamAEdge,
    drawLikelihood,
    source: 'real-h2h-results',
  };
};

export const theSportsDbSportsStatsAdapter = {
  id: 'thesportsdb-sports-stats',
  name: 'TheSportsDB Sports Stats Adapter',
  type: 'sports-stats',
  async getTodayFixtures({ date, country = 'International', sport = 'Football' }) {
    const fixtures = await getMatchesByCountrySportAndDate(country, sport, date);

    return {
      provider: this.name,
      date,
      fixtures,
      fetchedAt: new Date().toISOString(),
      mode: getTheSportsDbStatus().mode,
      note: 'Fixture list is sourced from TheSportsDB and filtered by country, sport, and date.',
    };
  },
  async getMatchStats({ teamA, teamB }) {
    const [homeTeam, awayTeam] = await Promise.all([searchTeam(teamA), searchTeam(teamB)]);
    const [homeEvents, awayEvents, h2hEvents] = await Promise.all([
      getLastEvents(homeTeam?.idTeam),
      getLastEvents(awayTeam?.idTeam),
      getH2hEvents(homeTeam?.strTeam || teamA, awayTeam?.strTeam || teamB),
    ]);

    const home = buildTeamProfile({ requestedName: teamA, team: homeTeam, events: homeEvents });
    const away = buildTeamProfile({ requestedName: teamB, team: awayTeam, events: awayEvents });
    const combinedEvents = [...homeEvents, ...awayEvents];
    const hasRealRecentForm = home.sourceEvents > 0 || away.sourceEvents > 0;
    const missingFields = [
      homeTeam ? null : `${teamA} team profile`,
      awayTeam ? null : `${teamB} team profile`,
      home.sourceEvents ? null : `${teamA} recent form`,
      away.sourceEvents ? null : `${teamB} recent form`,
      'league table ranking',
    ].filter(Boolean);

    return {
      provider: this.name,
      mode: hasRealRecentForm ? 'real-api' : 'estimated',
      dataQuality: {
        status: hasRealRecentForm ? 'partial_real' : 'estimated',
        realFields: [
          homeTeam ? `${teamA} team profile` : null,
          awayTeam ? `${teamB} team profile` : null,
          home.sourceEvents ? `${teamA} recent form` : null,
          away.sourceEvents ? `${teamB} recent form` : null,
          h2hEvents.length ? 'head-to-head' : null,
        ].filter(Boolean),
        missingFields,
        note: hasRealRecentForm
          ? 'Recent team results are real provider data; missing rankings are treated neutrally.'
          : 'No recent result feed was returned, so the scoring engine uses neutral estimates and lowers confidence.',
      },
      teams: {
        home,
        away,
      },
      h2h: buildH2h({ events: h2hEvents, teamA: homeTeam?.strTeam || teamA }),
      leagueProfile: buildLeagueProfile(combinedEvents),
      fetchedAt: new Date().toISOString(),
    };
  },
  async status() {
    const sportsDbStatus = getTheSportsDbStatus();
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: isTheSportsDbConfigured() ? 'online' : 'needs_config',
      mode: sportsDbStatus.mode,
      updateCadence: sportsDbStatus.updateCadence,
    };
  },
};
