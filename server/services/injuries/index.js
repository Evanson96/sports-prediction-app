import { apiFootballInjuriesAdapter } from './apiFootballInjuriesAdapter.js';
import { unavailableInjuriesAdapter } from './unavailableInjuriesAdapter.js';

export const getTeamNews = async (matchInput) => {
  try {
    const apiFootballNews = await apiFootballInjuriesAdapter.getTeamNews(matchInput);
    if (apiFootballNews.mode !== 'missing') return apiFootballNews;
    return apiFootballNews;
  } catch {
    return unavailableInjuriesAdapter.getTeamNews(matchInput);
  }
};

export const getInjuriesStatus = async () => {
  const [apiFootball, unavailable] = await Promise.all([
    apiFootballInjuriesAdapter.status(),
    unavailableInjuriesAdapter.status(),
  ]);

  return {
    id: 'injuries-provider-chain',
    name: 'Injuries Provider Chain',
    type: 'injuries',
    status: apiFootball.status === 'online' ? 'online' : 'needs_config',
    mode: apiFootball.status === 'online' ? 'api-football-first' : 'missing',
    updateCadence: 'API-Football first; otherwise marked missing',
    providers: [apiFootball, unavailable],
  };
};
