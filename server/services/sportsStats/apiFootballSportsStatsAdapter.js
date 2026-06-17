import { fetchApiFootballJson, getApiFootballSeason, getApiFootballStatus, isApiFootballConfigured } from '../providers/apiFootballClient.js';
import { nameScore } from '../../utils/normalize.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const parseStandingForm = (value) =>
  String(value || '')
    .toUpperCase()
    .split('')
    .filter((item) => ['W', 'D', 'L'].includes(item))
    .slice(-5);

const resultForTeamId = (event, teamId, teamName) => {
  const homeId = String(event.teams?.home?.id || '');
  const awayId = String(event.teams?.away?.id || '');
  const homeScore = Number(event.goals?.home);
  const awayScore = Number(event.goals?.away);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  const isHome = teamId ? homeId === String(teamId) : nameScore(event.teams?.home?.name, teamName) >= nameScore(event.teams?.away?.name, teamName);
  const goalsFor = isHome ? homeScore : awayScore;
  const goalsAgainst = isHome ? awayScore : homeScore;

  return {
    result: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L',
    goalsFor,
    goalsAgainst,
    isHome,
  };
};

const formScore = (form) => {
  if (!form.length) return null;
  const points = form.reduce((total, result) => total + (result === 'W' ? 3 : result === 'D' ? 1 : 0), 0);
  return Math.round((points / (form.length * 3)) * 100);
};

const getLastFixtures = async ({ teamId, season }) => {
  if (!teamId) return [];
  const data = await fetchApiFootballJson(
    'fixtures',
    { team: teamId, last: 5, season },
    { cacheKey: `api-football:last:${teamId}:${season}` },
  );
  return Array.isArray(data.response) ? data.response : [];
};

const getH2h = async ({ homeTeamId, awayTeamId }) => {
  if (!homeTeamId || !awayTeamId) return [];
  const data = await fetchApiFootballJson(
    'fixtures/headtohead',
    { h2h: `${homeTeamId}-${awayTeamId}`, last: 10 },
    { cacheKey: `api-football:h2h:${homeTeamId}:${awayTeamId}` },
  );
  return Array.isArray(data.response) ? data.response : [];
};

const getStandings = async ({ leagueId, season }) => {
  if (!leagueId || !season) return [];
  const data = await fetchApiFootballJson(
    'standings',
    { league: leagueId, season },
    { cacheKey: `api-football:standings:${leagueId}:${season}` },
  );
  const groups = data.response?.[0]?.league?.standings || [];
  return groups.flat();
};

const getFixtureStatistics = async (fixtureId) => {
  if (!fixtureId) return [];
  const data = await fetchApiFootballJson(
    'fixtures/statistics',
    { fixture: fixtureId },
    { cacheKey: `api-football:statistics:${fixtureId}` },
  );
  return Array.isArray(data.response) ? data.response : [];
};

const getFixtureLineups = async (fixtureId) => {
  if (!fixtureId) return [];
  const data = await fetchApiFootballJson(
    'fixtures/lineups',
    { fixture: fixtureId },
    { cacheKey: `api-football:lineups:${fixtureId}` },
  );
  return Array.isArray(data.response) ? data.response : [];
};

const buildStandingSummary = (standing) => {
  if (!standing) return null;
  const all = standing.all || {};
  const goals = all.goals || {};

  return {
    rank: toNumberOrNull(standing.rank),
    points: toNumberOrNull(standing.points),
    played: toNumberOrNull(all.played),
    wins: toNumberOrNull(all.win ?? all.wins),
    draws: toNumberOrNull(all.draw ?? all.draws),
    losses: toNumberOrNull(all.lose ?? all.losses),
    goalsFor: toNumberOrNull(goals.for),
    goalsAgainst: toNumberOrNull(goals.against),
    goalsDiff: toNumberOrNull(standing.goalsDiff),
    form: parseStandingForm(standing.form),
    group: standing.group || null,
    description: standing.description || null,
  };
};

const buildTeamProfile = ({ teamName, teamId, lastFixtures, standing }) => {
  const results = lastFixtures.map((event) => resultForTeamId(event, teamId, teamName)).filter(Boolean);
  const fixtureForm = results.map((item) => item.result);
  const standings = buildStandingSummary(standing);
  const form = fixtureForm.length ? fixtureForm : standings?.form || [];
  const score = formScore(form);
  const goalDiffAverage = results.length
    ? results.reduce((sum, result) => sum + result.goalsFor - result.goalsAgainst, 0) / results.length
    : 0;
  const homeScore = formScore(results.filter((item) => item.isHome).map((item) => item.result));
  const awayScore = formScore(results.filter((item) => !item.isHome).map((item) => item.result));

  return {
    name: teamName,
    providerId: teamId || null,
    logo: standing?.team?.logo || null,
    country: null,
    form,
    formSource: fixtureForm.length ? 'recent-fixtures' : standings?.form?.length ? 'standings-form' : 'missing',
    formScore: score ?? 50,
    rating: Math.round(clamp(48 + (score ?? 50) * 0.45 + goalDiffAverage * 8, 35, 88)),
    homeStrength: Math.round(clamp(50 + (homeScore ?? score ?? 50) * 0.45, 40, 90)),
    awayStrength: Math.round(clamp(48 + (awayScore ?? score ?? 50) * 0.42, 35, 88)),
    ranking: standings?.rank ?? null,
    points: standings?.points ?? null,
    wins: standings?.wins ?? null,
    draws: standings?.draws ?? null,
    losses: standings?.losses ?? null,
    goalsFor: standings?.goalsFor ?? null,
    goalsAgainst: standings?.goalsAgainst ?? null,
    standings,
    sourceEvents: results.length,
  };
};

const buildH2h = ({ h2hFixtures, homeTeamId }) => {
  const results = h2hFixtures.map((event) => resultForTeamId(event, homeTeamId)).filter(Boolean);

  if (!results.length) {
    return {
      meetings: [],
      teamAEdge: 50,
      drawLikelihood: 25,
      source: 'missing',
    };
  }

  const teamAPoints = results.reduce((sum, item) => sum + (item.result === 'W' ? 3 : item.result === 'D' ? 1 : 0), 0);

  return {
    meetings: h2hFixtures.slice(0, 5).map((event) => ({
      date: event.fixture?.date?.slice(0, 10),
      home: event.teams?.home?.name,
      away: event.teams?.away?.name,
      score: `${event.goals?.home ?? '-'}-${event.goals?.away ?? '-'}`,
    })),
    teamAEdge: Math.round((teamAPoints / (results.length * 3)) * 100),
    drawLikelihood: Math.round((results.filter((item) => item.result === 'D').length / results.length) * 100),
    source: 'api-football-h2h',
  };
};

const leagueProfileFromFixtures = (fixtures) => {
  const scored = fixtures
    .map((fixture) => ({ home: Number(fixture.goals?.home), away: Number(fixture.goals?.away) }))
    .filter((score) => Number.isFinite(score.home) && Number.isFinite(score.away));

  if (!scored.length) {
    return {
      averageGoals: 2.45,
      drawRate: 25,
      homeAdvantage: 4,
      source: 'neutral-estimate',
    };
  }

  const averageGoals = scored.reduce((sum, score) => sum + score.home + score.away, 0) / scored.length;
  const drawRate = (scored.filter((score) => score.home === score.away).length / scored.length) * 100;
  const homeAdvantage = scored.reduce((sum, score) => sum + score.home - score.away, 0) / scored.length;

  return {
    averageGoals: Number(averageGoals.toFixed(2)),
    drawRate: Math.round(drawRate),
    homeAdvantage: Math.round(homeAdvantage * 4),
    source: 'api-football-recent-results',
  };
};

export const apiFootballSportsStatsAdapter = {
  id: 'api-football-sports-stats',
  name: 'API-Football Sports Stats Adapter',
  type: 'sports-stats',
  async getMatchStats(matchInput) {
    if (!isApiFootballConfigured() || matchInput.sport !== 'Football') {
      throw new Error('API-Football sports stats provider not connected for this match.');
    }

    const season = matchInput.providerSeason || getApiFootballSeason(matchInput.matchDate);
    const [homeFixtures, awayFixtures, h2hFixtures, standings, fixtureStatistics, fixtureLineups] = await Promise.all([
      getLastFixtures({ teamId: matchInput.providerHomeTeamId, season }).catch(() => []),
      getLastFixtures({ teamId: matchInput.providerAwayTeamId, season }).catch(() => []),
      getH2h({ homeTeamId: matchInput.providerHomeTeamId, awayTeamId: matchInput.providerAwayTeamId }).catch(() => []),
      getStandings({ leagueId: matchInput.providerLeagueId, season }).catch(() => []),
      getFixtureStatistics(matchInput.providerFixtureId).catch(() => []),
      getFixtureLineups(matchInput.providerFixtureId).catch(() => []),
    ]);

    const homeStanding = standings.find((row) => String(row.team?.id) === String(matchInput.providerHomeTeamId));
    const awayStanding = standings.find((row) => String(row.team?.id) === String(matchInput.providerAwayTeamId));
    const hasStandings = standings.length > 0;
    const hasTeamStandings = Boolean(homeStanding || awayStanding);
    const home = buildTeamProfile({
      teamName: matchInput.teamA,
      teamId: matchInput.providerHomeTeamId,
      lastFixtures: homeFixtures,
      standing: homeStanding,
    });
    const away = buildTeamProfile({
      teamName: matchInput.teamB,
      teamId: matchInput.providerAwayTeamId,
      lastFixtures: awayFixtures,
      standing: awayStanding,
    });
    const realFields = [
      home.sourceEvents ? `${matchInput.teamA} recent form` : null,
      away.sourceEvents ? `${matchInput.teamB} recent form` : null,
      h2hFixtures.length ? 'head-to-head' : null,
      hasStandings ? 'league table standings' : null,
      home.ranking ? `${matchInput.teamA} league ranking` : null,
      away.ranking ? `${matchInput.teamB} league ranking` : null,
      typeof home.standings?.points === 'number' ? `${matchInput.teamA} points/wins/draws/losses/goals` : null,
      typeof away.standings?.points === 'number' ? `${matchInput.teamB} points/wins/draws/losses/goals` : null,
      fixtureStatistics.length ? 'fixture statistics' : null,
      fixtureLineups.length ? 'lineups' : null,
    ].filter(Boolean);
    const missingFields = [
      home.sourceEvents ? null : `${matchInput.teamA} recent form`,
      away.sourceEvents ? null : `${matchInput.teamB} recent form`,
      h2hFixtures.length ? null : 'head-to-head',
      hasStandings ? null : 'league table ranking',
      hasStandings && !homeStanding ? `${matchInput.teamA} standings row` : null,
      hasStandings && !awayStanding ? `${matchInput.teamB} standings row` : null,
      fixtureStatistics.length ? null : 'fixture statistics',
      fixtureLineups.length ? null : 'lineups before kickoff',
    ].filter(Boolean);
    const qualityStatus =
      hasTeamStandings && fixtureStatistics.length
        ? 'real'
        : realFields.length
          ? 'partial_real'
          : 'missing';

    return {
      provider: this.name,
      mode: realFields.length ? 'real-api' : 'missing',
      dataQuality: {
        status: qualityStatus,
        realFields,
        missingFields,
        note: realFields.length
          ? 'API-Football returned real football stats where available. Missing fields are not estimated unless needed neutrally by scoring.'
          : 'API-Football did not return stats for this fixture, so stats are missing.',
      },
      teams: { home, away },
      h2h: buildH2h({ h2hFixtures, homeTeamId: matchInput.providerHomeTeamId }),
      leagueProfile: leagueProfileFromFixtures([...homeFixtures, ...awayFixtures]),
      fixtureStatistics,
      fixtureLineups,
      standings: {
        leagueId: matchInput.providerLeagueId,
        season,
        rows: standings,
      },
      fetchedAt: new Date().toISOString(),
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
