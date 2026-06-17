const weights = {
  recentForm: 0.25,
  headToHead: 0.15,
  homeAway: 0.15,
  ranking: 0.1,
  injuries: 0.1,
  consensus: 0.15,
  odds: 0.1,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeSport = (sport) =>
  String(sport || '')
    .toLowerCase()
    .trim();

const isFootball = (sport) => ['football', 'soccer'].includes(normalizeSport(sport));
const isCricket = (sport) => normalizeSport(sport) === 'cricket';

const confidenceLevel = (confidence) => {
  if (confidence >= 75) return 'High';
  if (confidence >= 55) return 'Medium';
  return 'Low';
};

const marketConfidence = (base, spread = 0) => Math.round(clamp(base + spread, 38, 86));

const getBestOdds = (bookmakers, marketKey) =>
  bookmakers.reduce((best, bookmaker) => {
    const price = bookmaker.markets[marketKey];
    if (typeof price !== 'number') return best;
    if (!best || price > best.odds) {
      return { bookmaker: bookmaker.bookmaker, odds: price };
    }
    return best;
  }, null);

const marketNote = (bookmakerOdds) =>
  bookmakerOdds.sourceMode === 'real-api'
    ? 'Live odds can move quickly. Re-check prices with the bookmaker before staking.'
    : 'Real odds are unavailable for this fixture, so odds-based value is not confirmed.';

const isSignalReal = (signal) =>
  ['real-api', 'derived-real-odds', 'local-deterministic'].includes(signal?.mode) ||
  ['real', 'partial_real', 'derived_real'].includes(signal?.dataQuality?.status);

const getDataQuality = (signals) => {
  const signalEntries = [
    ['sportsStats', signals.sportsStats],
    ['bookmakerOdds', signals.bookmakerOdds],
    ['predictionSources', signals.predictionSources],
    ['injuries', signals.injuries],
    ['weather', signals.weather],
  ];
  const real = signalEntries.filter(([, signal]) => isSignalReal(signal)).map(([key]) => key);
  const notAvailable = signalEntries
    .filter(([, signal]) => signal?.mode === 'not_available' || signal?.dataQuality?.status === 'not_available')
    .map(([key]) => key);
  const missing = signalEntries
    .filter(([, signal]) => signal?.mode === 'missing' || signal?.dataQuality?.status === 'missing')
    .map(([key]) => key);
  const estimated = signalEntries
    .filter(([, signal]) => signal?.mode === 'estimated' || signal?.dataQuality?.status === 'estimated')
    .map(([key]) => key);
  const score = Math.max(15, Math.round((real.length / signalEntries.length) * 100 - missing.length * 5));

  return {
    status: score >= 75 ? 'strong' : score >= 50 ? 'mixed' : 'limited',
    score,
    real,
    missing,
    notAvailable,
    estimated,
    notes: signalEntries.map(([key, signal]) => ({
      key,
      status: signal?.dataQuality?.status || signal?.mode || 'unknown',
      note: signal?.dataQuality?.note || signal?.note || '',
      missingFields: signal?.dataQuality?.missingFields || [],
      notAvailableFields: signal?.dataQuality?.notAvailableFields || [],
      realFields: signal?.dataQuality?.realFields || [],
    })),
  };
};

const weightedHomeScore = ({ sportsStats, bookmakerOdds, predictionSources, injuries }) => {
  const { home, away } = sportsStats.teams;
  const oddsHome = bookmakerOdds.impliedProbabilities.home;
  const rankingEdge =
    typeof home.ranking === 'number' && typeof away.ranking === 'number'
      ? clamp((away.ranking - home.ranking + 10) * 5, 0, 100)
      : 50;
  const homeInjuryImpact = typeof injuries.home.injuryImpact === 'number' ? injuries.home.injuryImpact : 0;
  const awayInjuryImpact = typeof injuries.away.injuryImpact === 'number' ? injuries.away.injuryImpact : 0;
  const hasVerifiedTeamNewsImpact =
    injuries.mode !== 'missing' &&
    injuries.mode !== 'not_available' &&
    typeof injuries.home.injuryImpact === 'number' &&
    typeof injuries.away.injuryImpact === 'number';
  const injuryScore = hasVerifiedTeamNewsImpact ? clamp(100 - homeInjuryImpact + awayInjuryImpact / 2, 0, 100) : 50;

  return (
    home.formScore * weights.recentForm +
    sportsStats.h2h.teamAEdge * weights.headToHead +
    clamp(home.homeStrength - away.awayStrength + 50, 0, 100) * weights.homeAway +
    rankingEdge * weights.ranking +
    injuryScore * weights.injuries +
    predictionSources.homeConsensus * weights.consensus +
    oddsHome * weights.odds
  );
};

export const buildPrediction = (matchInput, signals) => {
  const { sportsStats, bookmakerOdds, injuries, weather } = signals;
  const dataQuality = getDataQuality(signals);
  const score = weightedHomeScore(signals);
  const { teamA, teamB } = matchInput;
  const { home, away } = sportsStats.teams;
  const goalBias = sportsStats.leagueProfile.averageGoals - weather.riskImpact * 0.02;
  const ratingGap = home.rating - away.rating;
  const homePick = score >= 54;
  const drawLean = Math.abs(ratingGap) <= 5 && sportsStats.leagueProfile.drawRate >= 25;
  const mainPick = drawLean ? 'Draw' : homePick ? `${teamA} Win` : `${teamB} Win`;
  const qualityPenalty = dataQuality.status === 'strong' ? 0 : dataQuality.status === 'mixed' ? -5 : -12;
  const mainConfidence = marketConfidence(score, (drawLean ? -8 : 0) + qualityPenalty);
  const overPick = goalBias >= 2.5 || Math.abs(ratingGap) >= 10 ? 'Over 2.5' : 'Under 2.5';
  const bttsPick = Math.abs(ratingGap) <= 12 && goalBias >= 2.3 ? 'Yes' : 'No';
  const scoreline = drawLean ? '1-1' : homePick ? '2-1' : '1-2';
  const footballMatch = isFootball(matchInput.sport);
  const cricketMatch = isCricket(matchInput.sport);
  const nonFootballHomePick = score >= 50;
  const nonFootballWinner = nonFootballHomePick ? teamA : teamB;

  const predictions = footballMatch
    ? [
        {
          market: '1X2',
          pick: mainPick,
          confidence: mainConfidence,
          level: confidenceLevel(mainConfidence),
        },
        {
          market: 'Double Chance',
          pick: drawLean ? '1X' : homePick ? '1X' : 'X2',
          confidence: marketConfidence(mainConfidence, 9),
          level: confidenceLevel(marketConfidence(mainConfidence, 9)),
        },
        {
          market: 'Both Teams To Score',
          pick: bttsPick,
          confidence: marketConfidence(58 + goalBias * 5 - Math.abs(ratingGap) * 0.7),
          level: confidenceLevel(marketConfidence(58 + goalBias * 5 - Math.abs(ratingGap) * 0.7)),
        },
        {
          market: 'Over/Under 2.5',
          pick: overPick,
          confidence: marketConfidence(50 + goalBias * 9 + Math.abs(ratingGap) * 0.35),
          level: confidenceLevel(marketConfidence(50 + goalBias * 9 + Math.abs(ratingGap) * 0.35)),
        },
        {
          market: 'Correct Score',
          pick: scoreline,
          confidence: marketConfidence(34 + Math.abs(ratingGap) * 0.45),
          level: 'Speculative',
        },
      ]
    : [
        {
          market: cricketMatch ? 'Match Winner' : 'Match Winner',
          pick: `${nonFootballWinner} to win`,
          confidence: mainConfidence,
          level: confidenceLevel(mainConfidence),
        },
      ];

  const mainPrediction = predictions[0];
  const unavailableOdds = { bookmaker: 'Unavailable', odds: null };
  const bestMainMarket = footballMatch
    ? drawLean
      ? 'draw'
      : homePick
        ? 'homeWin'
        : 'awayWin'
    : nonFootballHomePick
      ? 'homeWin'
      : 'awayWin';
  const bestMain = getBestOdds(bookmakerOdds.bookmakers, bestMainMarket) || unavailableOdds;
  const bestDoubleChance = getBestOdds(bookmakerOdds.bookmakers, homePick ? 'homeWin' : 'awayWin') || unavailableOdds;
  const bestGoals = getBestOdds(bookmakerOdds.bookmakers, overPick === 'Over 2.5' ? 'over25' : 'under25') || unavailableOdds;

  const valueBets = footballMatch
    ? [
        {
          market: mainPrediction.market,
          pick: mainPrediction.pick,
          bookmaker: bestMain.bookmaker,
          odds: bestMain.odds,
          valueRating: bestMain.odds ? (mainPrediction.confidence >= 65 ? 'Positive value' : 'Small edge only') : 'Odds unavailable',
          note: marketNote(bookmakerOdds),
        },
        {
          market: 'Over/Under 2.5',
          pick: overPick,
          bookmaker: bestGoals.bookmaker,
          odds: bestGoals.odds,
          valueRating: bestGoals.odds >= 1.85 ? 'Watchlist value' : bestGoals.odds ? 'Low value' : 'Odds unavailable',
          note: 'Goals market depends on lineups, weather, tempo, and late market movement.',
        },
      ]
    : [
        {
          market: mainPrediction.market,
          pick: mainPrediction.pick,
          bookmaker: bestMain.bookmaker,
          odds: bestMain.odds,
          valueRating: bestMain.odds ? (mainPrediction.confidence >= 65 ? 'Positive value' : 'Small edge only') : 'Odds unavailable',
          note: `${matchInput.sport || 'This sport'} support is limited to winner research unless a sport-specific odds/statistics provider is connected.`,
        },
      ];

  if (footballMatch && drawLean) {
    valueBets.unshift({
      market: 'Double Chance',
      pick: '1X',
      bookmaker: bestDoubleChance.bookmaker,
      odds: bestDoubleChance.odds,
      valueRating: 'Lower-risk angle',
      note: 'Double chance reduces risk but usually reduces payout.',
    });
  }

  return {
    mainPrediction,
    predictions,
    valueBets,
    modelWeights: {
      recentForm: '25%',
      headToHead: '15%',
      homeAwayPerformance: '15%',
      leaguePositionRanking: '10%',
      injuriesTeamNews: footballMatch ? '10%' : 'Neutral unless sport-specific team news is connected',
      predictionSourceConsensus: '15%',
      bookmakerOdds: '10%',
    },
    dataQuality,
  };
};

export const getScoringStatus = async () => ({
  id: 'weighted-scoring-v1',
  name: 'Weighted Scoring Engine',
  type: 'scoring',
  status: 'online',
  mode: 'local',
  updateCadence: 'Runs per prediction request',
});
