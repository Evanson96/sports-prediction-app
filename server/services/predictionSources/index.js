import { apiFootballPredictionsAdapter } from './apiFootballPredictionsAdapter.js';
import { marketConsensusAdapter } from './marketConsensusAdapter.js';

const average = (values) => {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!clean.length) return 50;
  return Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
};

export const getPredictionConsensus = async (matchInput, context) => {
  let apiFootballConsensus = null;
  let marketConsensus = null;

  try {
    apiFootballConsensus = await apiFootballPredictionsAdapter.getConsensus(matchInput, context);
  } catch {
    apiFootballConsensus = null;
  }

  try {
    marketConsensus = await marketConsensusAdapter.getConsensus(matchInput, context);
  } catch {
    marketConsensus = null;
  }

  const hasApiFootball = apiFootballConsensus?.mode !== 'missing' && apiFootballConsensus?.dataQuality?.status === 'real';
  const hasMarketConsensus = marketConsensus?.mode !== 'missing' && marketConsensus?.dataQuality?.status === 'derived_real';

  if (!hasApiFootball && !hasMarketConsensus) {
    return marketConsensus || apiFootballConsensus || marketConsensusAdapter.getConsensus(matchInput, context);
  }

  const sources = [
    ...(hasApiFootball
      ? apiFootballConsensus.sources.map((source) => ({
          ...source,
          type: 'independent-provider',
          label: 'API-Football prediction',
        }))
      : []),
    ...(hasMarketConsensus
      ? marketConsensus.sources.map((source) => ({
          ...source,
          type: 'bookmaker-derived',
          label: 'Bookmaker-derived probability',
        }))
      : []),
  ];

  return {
    provider: 'Prediction Sources Chain',
    mode: hasApiFootball ? 'real-api' : 'derived-real-odds',
    homeConsensus: average([
      hasApiFootball ? apiFootballConsensus.homeConsensus : null,
      hasMarketConsensus ? marketConsensus.homeConsensus : null,
    ]),
    awayConsensus: average([
      hasApiFootball ? apiFootballConsensus.awayConsensus : null,
      hasMarketConsensus ? marketConsensus.awayConsensus : null,
    ]),
    sources,
    sourceBreakdown: {
      apiFootball: hasApiFootball ? apiFootballConsensus : apiFootballConsensus || null,
      bookmakerDerived: hasMarketConsensus ? marketConsensus : marketConsensus || null,
    },
    dataQuality: {
      status: hasApiFootball ? 'real' : 'derived_real',
      realFields: [
        hasApiFootball ? 'API-Football prediction' : null,
        hasMarketConsensus ? 'bookmaker-derived probability' : null,
      ].filter(Boolean),
      missingFields: [
        hasApiFootball ? null : 'API-Football prediction',
        hasMarketConsensus ? null : 'bookmaker-derived probability',
      ].filter(Boolean),
      note: hasApiFootball
        ? 'API-Football prediction is shown as an independent source. Bookmaker-derived probability is shown separately when real odds are available.'
        : 'No API-Football prediction was returned; bookmaker-derived probability is calculated from real odds and labelled separately.',
    },
    fetchedAt: new Date().toISOString(),
  };
};

export const getPredictionSourcesStatus = async () => {
  const [apiFootball, marketConsensus] = await Promise.all([
    apiFootballPredictionsAdapter.status(),
    marketConsensusAdapter.status(),
  ]);

  return {
    id: 'prediction-sources-chain',
    name: 'Prediction Sources Provider Chain',
    type: 'prediction-sources',
    status: apiFootball.status === 'online' || marketConsensus.status === 'online' ? 'online' : 'needs_config',
    mode: apiFootball.status === 'online' ? 'api-football-first' : 'derived-from-odds',
    updateCadence: 'API-Football predictions first; odds-derived consensus only when real odds exist',
    providers: [apiFootball, marketConsensus],
  };
};
