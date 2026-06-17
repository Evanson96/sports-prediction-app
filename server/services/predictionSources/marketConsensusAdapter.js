const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const marketConsensusAdapter = {
  id: 'market-consensus',
  name: 'Market Consensus Adapter',
  type: 'prediction-sources',
  async getConsensus({ teamA, teamB }, { bookmakerOdds } = {}) {
    const isRealOdds = bookmakerOdds?.sourceMode === 'real-api';
    const homeProbability = bookmakerOdds?.impliedProbabilities?.home;
    const awayProbability = bookmakerOdds?.impliedProbabilities?.away;

    if (!isRealOdds || typeof homeProbability !== 'number' || typeof awayProbability !== 'number') {
      return {
        provider: this.name,
        mode: 'missing',
        homeConsensus: 50,
        awayConsensus: 50,
        sources: [],
        dataQuality: {
          status: 'missing',
          realFields: [],
          missingFields: ['independent prediction-source consensus'],
          note: 'No independent consensus provider is configured. This factor is treated neutrally.',
        },
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      provider: this.name,
      mode: 'derived-real-odds',
      homeConsensus: Math.round(clamp(homeProbability, 5, 90)),
      awayConsensus: Math.round(clamp(awayProbability, 5, 90)),
      sources: [
        {
          name: bookmakerOdds.provider,
          pick: homeProbability >= awayProbability ? `${teamA} market edge` : `${teamB} market edge`,
          confidence: Math.round(Math.max(homeProbability, awayProbability)),
        },
      ],
      dataQuality: {
        status: 'derived_real',
        realFields: ['bookmaker market consensus'],
        missingFields: ['independent analyst/model source feed'],
        note: 'Consensus is derived from real bookmaker implied probabilities until a separate prediction-source API is connected.',
      },
      fetchedAt: new Date().toISOString(),
    };
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: 'online',
      mode: 'derived-real-odds',
      updateCadence: 'Runs after bookmaker odds are fetched',
    };
  },
};
