import { getAiAnalysisStatus } from './aiAnalysis/index.js';
import { getAnalyticsStatus } from './analytics/index.js';
import { getBookmakerOddsStatus } from './bookmakerOdds/index.js';
import { getDatabaseStatus, recordProviderStatus } from './database/index.js';
import { getInjuriesStatus } from './injuries/index.js';
import { getMatchProvider } from './matchService.js';
import { getPredictionSourcesStatus } from './predictionSources/index.js';
import { providerFallbackOrder } from './providerFallback.js';
import { getScoringStatus } from './scoring/index.js';
import { getSportsStatsStatus } from './sportsStats/index.js';
import { getWeatherStatus } from './weather/index.js';

export const getSourceStatus = async () => {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    providerFallbackOrder,
    sources: await Promise.all([
      getSportsStatsStatus(),
      getBookmakerOddsStatus(),
      getPredictionSourcesStatus(),
      getWeatherStatus(),
      getInjuriesStatus(),
      getAiAnalysisStatus(),
      getScoringStatus(),
      getAnalyticsStatus(),
      getDatabaseStatus(),
      {
        id: 'real-match-fixtures',
        name: `${getMatchProvider().name} Match Fixtures`,
        type: 'match-fixtures',
        status: 'online',
        mode: getMatchProvider().mode,
        updateCadence: 'Fetched and cached per country/sport selection',
      },
    ]),
    disclaimer: 'Adapters may be real, derived, missing, estimated, or waiting for API keys. Missing data is labelled and treated neutrally.',
  };

  try {
    await recordProviderStatus(snapshot);
  } catch {
    // Provider status should still load even if persistence is temporarily unavailable.
  }

  return snapshot;
};
