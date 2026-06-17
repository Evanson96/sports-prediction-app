import { fetchApiFootballJson, getApiFootballStatus, isApiFootballConfigured } from '../providers/apiFootballClient.js';

const injuryImpact = (items) => {
  if (!items.length) return 0;
  const severityScore = items.reduce((sum, item) => {
    const reason = String(item.player?.reason || item.player?.type || '').toLowerCase();
    if (reason.includes('suspended')) return sum + 5;
    if (reason.includes('injured') || reason.includes('injury')) return sum + 6;
    if (reason.includes('doubtful')) return sum + 3;
    return sum + 4;
  }, 0);
  return Math.min(35, severityScore);
};

const groupByTeam = (rows, teamId) =>
  rows.filter((item) => String(item.team?.id || '') === String(teamId));

const getFixtureLineups = async (fixtureId) => {
  if (!fixtureId) return [];
  const data = await fetchApiFootballJson(
    'fixtures/lineups',
    { fixture: fixtureId },
    { cacheKey: `api-football:team-news-lineups:${fixtureId}` },
  );
  return Array.isArray(data.response) ? data.response : [];
};

const lineupForTeam = (lineups, teamId) =>
  lineups.find((lineup) => String(lineup.team?.id || '') === String(teamId)) || null;

const lineupSummary = (lineup) => {
  if (!lineup) return '';
  const starters = (lineup.startXI || [])
    .map((item) => item.player?.name)
    .filter(Boolean)
    .slice(0, 5)
    .join(', ');
  return `Confirmed lineup returned${lineup.formation ? ` (${lineup.formation})` : ''}${starters ? `; starters include ${starters}` : ''}.`;
};

const summaryFor = (rows, lineup) => {
  const injurySummary = rows
    .slice(0, 4)
    .map((item) => `${item.player?.name || 'Player'}: ${item.player?.reason || item.player?.type || 'team news'}`)
    .join('; ');
  const lineupText = lineupSummary(lineup);

  if (injurySummary && lineupText) return `${injurySummary}. ${lineupText}`;
  if (injurySummary) return injurySummary;
  if (lineupText) return `No injuries/suspensions returned. ${lineupText}`;
  return 'No provider data available for this match.';
};

export const apiFootballInjuriesAdapter = {
  id: 'api-football-injuries',
  name: 'API-Football Injuries Adapter',
  type: 'injuries',
  async getTeamNews(matchInput) {
    if (!isApiFootballConfigured() || matchInput.sport !== 'Football' || !matchInput.providerFixtureId) {
      throw new Error('API-Football injuries provider not connected for this fixture.');
    }

    const [injuriesData, lineups] = await Promise.all([
      fetchApiFootballJson(
        'injuries',
        { fixture: matchInput.providerFixtureId },
        { cacheKey: `api-football:injuries:${matchInput.providerFixtureId}` },
      ).catch(() => ({ response: [] })),
      getFixtureLineups(matchInput.providerFixtureId).catch(() => []),
    ]);
    const rows = Array.isArray(injuriesData.response) ? injuriesData.response : [];
    const hasInjuries = rows.length > 0;
    const hasLineups = lineups.length > 0;

    if (!hasInjuries && !hasLineups) {
      return {
        provider: this.name,
        mode: 'missing',
        dataQuality: {
          status: 'missing',
          realFields: [],
          missingFields: ['injuries', 'suspensions', 'confirmed team news'],
          note: 'No provider data available for this match.',
        },
        home: {
          team: matchInput.teamA,
          injuryImpact: null,
          summary: 'No provider data available for this match.',
        },
        away: {
          team: matchInput.teamB,
          injuryImpact: null,
          summary: 'No provider data available for this match.',
        },
        lineups: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    const homeRows = groupByTeam(rows, matchInput.providerHomeTeamId);
    const awayRows = groupByTeam(rows, matchInput.providerAwayTeamId);
    const homeLineup = lineupForTeam(lineups, matchInput.providerHomeTeamId);
    const awayLineup = lineupForTeam(lineups, matchInput.providerAwayTeamId);
    const hasSuspensions = rows.some((row) => /suspend/i.test(`${row.player?.reason || ''} ${row.player?.type || ''}`));

    return {
      provider: this.name,
      mode: 'real-api',
      dataQuality: {
        status: hasInjuries && hasLineups ? 'real' : 'partial_real',
        realFields: [
          hasInjuries ? 'injuries/team news' : null,
          hasSuspensions ? 'suspensions' : null,
          hasLineups ? 'confirmed lineups/team news' : null,
        ].filter(Boolean),
        missingFields: [
          hasInjuries ? null : 'injuries and suspensions',
          hasLineups ? null : 'confirmed lineups/team news',
        ].filter(Boolean),
        note: 'API-Football returned team-news data for this fixture where available.',
      },
      home: {
        team: matchInput.teamA,
        injuryImpact: injuryImpact(homeRows),
        summary: summaryFor(homeRows, homeLineup),
        items: homeRows,
        lineup: homeLineup,
      },
      away: {
        team: matchInput.teamB,
        injuryImpact: injuryImpact(awayRows),
        summary: summaryFor(awayRows, awayLineup),
        items: awayRows,
        lineup: awayLineup,
      },
      lineups,
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
