import { fetchApiFootballJson, getApiFootballStatus, isApiFootballConfigured } from '../providers/apiFootballClient.js';

const pickPercent = (value) => {
  const number = Number(String(value || '').replace('%', ''));
  return Number.isFinite(number) ? number : null;
};

export const apiFootballPredictionsAdapter = {
  id: 'api-football-predictions',
  name: 'API-Football Predictions Adapter',
  type: 'prediction-sources',
  async getConsensus(matchInput) {
    if (!isApiFootballConfigured() || matchInput.sport !== 'Football' || !matchInput.providerFixtureId) {
      throw new Error('API-Football predictions provider not connected for this fixture.');
    }

    const data = await fetchApiFootballJson(
      'predictions',
      { fixture: matchInput.providerFixtureId },
      { cacheKey: `api-football:predictions:${matchInput.providerFixtureId}` },
    );
    const row = Array.isArray(data.response) ? data.response[0] : null;
    const percent = row?.predictions?.percent || {};
    const homeConsensus = pickPercent(percent.home);
    const awayConsensus = pickPercent(percent.away);

    if (typeof homeConsensus !== 'number' || typeof awayConsensus !== 'number') {
      return {
        provider: this.name,
        mode: 'missing',
        homeConsensus: 50,
        awayConsensus: 50,
        sources: [],
        dataQuality: {
          status: 'missing',
          realFields: [],
          missingFields: ['API-Football prediction percentages'],
          note: 'API-Football did not return prediction percentages for this fixture.',
        },
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      provider: this.name,
      mode: 'real-api',
      homeConsensus,
      awayConsensus,
      sources: [
        {
          name: 'API-Football Predictions',
          pick: row.predictions?.advice || row.predictions?.winner?.name || 'Provider prediction available',
          confidence: Math.max(homeConsensus, awayConsensus),
        },
      ],
      providerPrediction: row.predictions || null,
      dataQuality: {
        status: 'real',
        realFields: ['API-Football prediction percentages'],
        missingFields: [],
        note: 'Prediction consensus returned by API-Football.',
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
