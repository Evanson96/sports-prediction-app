const safeNumber = (value, fallback = 'N/A') => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export const localAnalysisAdapter = {
  id: 'local-analysis',
  name: 'Local Analysis Composer',
  type: 'ai-analysis',
  async buildReasoning(matchInput, prediction, signals) {
    const { teamA, teamB, league } = matchInput;
    const { sportsStats, bookmakerOdds, predictionSources, injuries, weather } = signals;
    const { home, away } = sportsStats.teams;
    const oddsLabel = bookmakerOdds.sourceMode === 'real-api' ? 'real bookmaker odds' : 'unavailable bookmaker odds';
    const injuryLabel =
      injuries.mode === 'missing'
        ? 'Verified team-news data is not configured, so injuries are treated neutrally.'
        : `Team-news impact is ${safeNumber(injuries.home.injuryImpact)}/100 for ${teamA} and ${safeNumber(injuries.away.injuryImpact)}/100 for ${teamB}.`;
    const consensusLabel =
      predictionSources.mode === 'derived-real-odds'
        ? `Market consensus from real odds rates ${teamA} at ${predictionSources.homeConsensus}/100 and ${teamB} at ${predictionSources.awayConsensus}/100.`
        : 'Independent prediction-source consensus is not configured, so that signal is neutral.';

    return [
      `${teamA} has a recent-form score of ${safeNumber(home.formScore)}/100 from ${home.sourceEvents || 0} provider result records, compared with ${teamB} at ${safeNumber(away.formScore)}/100 from ${away.sourceEvents || 0} records.`,
      `Home/away context rates ${teamA} at ${safeNumber(home.homeStrength)} and ${teamB}'s away strength at ${safeNumber(away.awayStrength)}.`,
      injuryLabel,
      consensusLabel,
      `Weather is "${weather.condition}" at ${weather.location || 'the match location'}, with disruption impact ${safeNumber(weather.riskImpact, 0)}/10.`,
      `The ${league} goal profile is ${safeNumber(sportsStats.leagueProfile.averageGoals)}, and the odds signal is based on ${oddsLabel}.`,
      `Main call: ${prediction.mainPrediction.pick} at ${prediction.mainPrediction.confidence}% confidence (${prediction.mainPrediction.level}). This is not a guarantee; lineups, motivation, market movement, and late news can change the risk profile.`,
    ].join(' ');
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: 'online',
      mode: 'local-deterministic',
      updateCadence: 'Generated per prediction request from available provider signals',
    };
  },
};
