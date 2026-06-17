import { apiFootballSportsStatsAdapter } from './apiFootballSportsStatsAdapter.js';
import { theSportsDbSportsStatsAdapter } from './theSportsDbSportsStatsAdapter.js';

export const getTodayFixtures = (params) => theSportsDbSportsStatsAdapter.getTodayFixtures(params);

const needsRecentFormFallback = (stats) =>
  stats?.dataQuality?.missingFields?.some((field) => /recent form|head-to-head/i.test(field)) ||
  stats?.leagueProfile?.source === 'neutral-estimate';

const mergeTeamProfile = (apiTeam, fallbackTeam) => {
  if (!fallbackTeam?.sourceEvents) return apiTeam;
  if (apiTeam?.sourceEvents) {
    return {
      ...apiTeam,
      logo: apiTeam.logo || fallbackTeam.logo,
      country: apiTeam.country || fallbackTeam.country,
    };
  }

  return {
    ...apiTeam,
    form: fallbackTeam.form,
    formSource: fallbackTeam.form?.length ? 'thesportsdb-recent-fixtures' : apiTeam.formSource,
    formScore: fallbackTeam.formScore,
    rating: fallbackTeam.rating,
    homeStrength: fallbackTeam.homeStrength,
    awayStrength: fallbackTeam.awayStrength,
    sourceEvents: fallbackTeam.sourceEvents,
    logo: apiTeam.logo || fallbackTeam.logo,
    country: apiTeam.country || fallbackTeam.country,
  };
};

const mergeApiFootballWithFallback = async (matchInput, apiStats) => {
  if (!needsRecentFormFallback(apiStats)) return apiStats;

  let fallbackStats = null;
  try {
    fallbackStats = await theSportsDbSportsStatsAdapter.getMatchStats(matchInput);
  } catch {
    return apiStats;
  }

  const merged = {
    ...apiStats,
    teams: {
      home: mergeTeamProfile(apiStats.teams.home, fallbackStats.teams.home),
      away: mergeTeamProfile(apiStats.teams.away, fallbackStats.teams.away),
    },
    h2h: apiStats.h2h?.source === 'missing' && fallbackStats.h2h?.meetings?.length ? fallbackStats.h2h : apiStats.h2h,
    leagueProfile:
      apiStats.leagueProfile?.source === 'neutral-estimate' && fallbackStats.leagueProfile?.source !== 'neutral-estimate'
        ? fallbackStats.leagueProfile
        : apiStats.leagueProfile,
  };

  const fallbackRealFields = fallbackStats.dataQuality?.realFields?.map((field) => `${field} via TheSportsDB`) || [];
  const missingFields = new Set(apiStats.dataQuality?.missingFields || []);

  if (merged.teams.home.sourceEvents) missingFields.delete(`${matchInput.teamA} recent form`);
  if (merged.teams.away.sourceEvents) missingFields.delete(`${matchInput.teamB} recent form`);
  if (merged.h2h?.source !== 'missing') missingFields.delete('head-to-head');

  const realFields = [...new Set([...(apiStats.dataQuality?.realFields || []), ...fallbackRealFields])];

  return {
    ...merged,
    provider: `${apiStats.provider} + TheSportsDB fallback`,
    dataQuality: {
      ...apiStats.dataQuality,
      status: apiStats.dataQuality?.status === 'real' ? 'real' : realFields.length ? 'partial_real' : 'missing',
      realFields,
      missingFields: [...missingFields],
      note:
        'API-Football enriches standings/statistics where available. TheSportsDB fills recent-form gaps only when API-Football does not return those records.',
    },
  };
};

export const getMatchStats = async (matchInput) => {
  try {
    const apiFootballStats = await apiFootballSportsStatsAdapter.getMatchStats(matchInput);
    if (apiFootballStats.mode !== 'missing') return mergeApiFootballWithFallback(matchInput, apiFootballStats);
  } catch {
    // TheSportsDB enriches the prototype when API-Football is not connected or has no data.
  }

  return theSportsDbSportsStatsAdapter.getMatchStats(matchInput);
};

export const getSportsStatsStatus = async () => {
  const [apiFootball, theSportsDb] = await Promise.all([
    apiFootballSportsStatsAdapter.status(),
    theSportsDbSportsStatsAdapter.status(),
  ]);

  return {
    id: 'sports-stats-chain',
    name: 'Sports Stats Provider Chain',
    type: 'sports-stats',
    status: apiFootball.status === 'online' || theSportsDb.status === 'online' ? 'online' : 'needs_config',
    mode: apiFootball.status === 'online' ? 'api-football-first' : 'thesportsdb-fallback',
    updateCadence: 'API-Football first, TheSportsDB metadata/results fallback',
    providers: [apiFootball, theSportsDb],
  };
};
