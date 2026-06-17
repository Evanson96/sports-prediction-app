import { buildReasoning } from '../aiAnalysis/index.js';
import { getBookmakerOdds } from '../bookmakerOdds/index.js';
import { getTeamNews } from '../injuries/index.js';
import { resolveMatchInput } from '../matchResolver/index.js';
import { getPredictionConsensus } from '../predictionSources/index.js';
import { buildPrediction } from '../scoring/index.js';
import { getMatchStats } from '../sportsStats/index.js';
import { getMatchWeather } from '../weather/index.js';
import { httpError } from '../../utils/httpError.js';
import { validateMatchInput, validateMatchSearchInput } from '../../utils/validation.js';

const publicTeamStats = (team = {}) => ({
  name: team.name,
  ranking: team.ranking,
  points: team.points,
  wins: team.wins,
  draws: team.draws,
  losses: team.losses,
  goalsFor: team.goalsFor,
  goalsAgainst: team.goalsAgainst,
  form: team.form,
  formSource: team.formSource,
  sourceEvents: team.sourceEvents,
  standings: team.standings,
});

const publicLineup = (lineup) =>
  lineup
    ? {
        team: lineup.team?.name,
        formation: lineup.formation || null,
        coach: lineup.coach?.name || null,
        starters: (lineup.startXI || []).map((item) => item.player?.name).filter(Boolean),
        substitutes: (lineup.substitutes || []).map((item) => item.player?.name).filter(Boolean),
      }
    : null;

const publicTeamNews = (teamNews = {}) => ({
  provider: teamNews.provider,
  mode: teamNews.mode,
  dataQuality: teamNews.dataQuality,
  home: {
    team: teamNews.home?.team,
    injuryImpact: teamNews.home?.injuryImpact,
    summary: teamNews.home?.summary,
    items: teamNews.home?.items || [],
    lineup: publicLineup(teamNews.home?.lineup),
  },
  away: {
    team: teamNews.away?.team,
    injuryImpact: teamNews.away?.injuryImpact,
    summary: teamNews.away?.summary,
    items: teamNews.away?.items || [],
    lineup: publicLineup(teamNews.away?.lineup),
  },
  fetchedAt: teamNews.fetchedAt,
});

export const buildPredictionResponse = async (matchInput, { resolution = null } = {}) => {
  const [sportsStats, injuries, weather] = await Promise.all([
    getMatchStats(matchInput),
    getTeamNews(matchInput),
    getMatchWeather(matchInput),
  ]);

  const bookmakerOdds = await getBookmakerOdds(matchInput, sportsStats);
  const predictionSources = await getPredictionConsensus(matchInput, { sportsStats, bookmakerOdds });
  const signals = { sportsStats, bookmakerOdds, predictionSources, injuries, weather };
  const prediction = buildPrediction(matchInput, signals);
  const reasoning = await buildReasoning(matchInput, prediction, signals);

  return {
    match: `${matchInput.teamA} vs ${matchInput.teamB}`,
    sport: matchInput.sport,
    league: matchInput.league,
    matchDate: matchInput.matchDate,
    matchResolution: resolution,
    mainPrediction: prediction.mainPrediction,
    predictions: prediction.predictions,
    oddsComparison: bookmakerOdds.bookmakers,
    oddsSource: {
      provider: bookmakerOdds.provider,
      mode: bookmakerOdds.sourceMode || 'unknown',
      fetchedAt: bookmakerOdds.fetchedAt,
      sportKey: bookmakerOdds.sportKey,
      sportTitle: bookmakerOdds.sportTitle,
      matchedBy: bookmakerOdds.matchedBy,
      matchedEvent: bookmakerOdds.matchedEvent,
      regions: bookmakerOdds.regions,
      selectedBookmakers: bookmakerOdds.selectedBookmakers,
      bookmakerView: bookmakerOdds.bookmakerView,
      requestedBookmakers: bookmakerOdds.requestedBookmakers,
      returnedBookmakers: bookmakerOdds.returnedBookmakers,
      unavailableBookmakers: bookmakerOdds.unavailableBookmakers,
      markets: bookmakerOdds.markets,
      bttsFetched: bookmakerOdds.bttsFetched,
      quota: bookmakerOdds.quota,
      fallbackReason: bookmakerOdds.fallbackReason,
      providerAttempts: bookmakerOdds.providerAttempts,
      fallbackOrder: bookmakerOdds.fallbackOrder,
      note: bookmakerOdds.note,
    },
    valueBets: prediction.valueBets,
    reasoning,
    modelWeights: prediction.modelWeights,
    dataQuality: prediction.dataQuality,
    statsSource: {
      provider: sportsStats.provider,
      mode: sportsStats.mode,
      dataQuality: sportsStats.dataQuality,
      teams: {
        home: publicTeamStats(sportsStats.teams?.home),
        away: publicTeamStats(sportsStats.teams?.away),
      },
      h2h: sportsStats.h2h,
      leagueProfile: sportsStats.leagueProfile,
      fixtureStatisticsCount: sportsStats.fixtureStatistics?.length || 0,
      fixtureLineupsCount: sportsStats.fixtureLineups?.length || 0,
      standingsAvailable: Boolean(sportsStats.standings?.rows?.length),
    },
    teamNews: publicTeamNews(injuries),
    predictionSource: {
      provider: predictionSources.provider,
      mode: predictionSources.mode,
      homeConsensus: predictionSources.homeConsensus,
      awayConsensus: predictionSources.awayConsensus,
      sources: predictionSources.sources || [],
      sourceBreakdown: predictionSources.sourceBreakdown || null,
      dataQuality: predictionSources.dataQuality,
      fetchedAt: predictionSources.fetchedAt,
    },
    sourceSummary: {
      mode: prediction.dataQuality.status,
      predictionSources: predictionSources.sources || [],
      adapters: Object.values(signals).map((signal) => ({
        provider: signal.provider,
        mode: signal.mode || signal.sourceMode || signal.dataQuality?.status || 'unknown',
        status: signal.dataQuality?.status || signal.sourceMode || signal.mode || 'unknown',
      })),
      note:
        prediction.dataQuality.status === 'strong'
          ? 'Most prediction inputs came from real or derived-real provider data.'
          : 'Some provider inputs are missing or estimated. Missing signals are shown to users and treated neutrally in scoring.',
    },
    riskWarning: 'Predictions are informational only. Betting involves risk. Never stake more than you can afford to lose.',
  };
};

export const resolveAndBuildPredictionResponse = async (body) => {
  const searchValidation = validateMatchSearchInput(body);

  if (!searchValidation.isValid) {
    throw httpError(400, 'Please fix the highlighted match details.', searchValidation.errors);
  }

  const resolved = await resolveMatchInput(searchValidation.value);
  const validation = validateMatchInput(resolved.matchInput);

  if (!validation.isValid) {
    throw httpError(400, 'The app could not detect the match sport and league.', validation.errors);
  }

  return buildPredictionResponse(validation.value, { resolution: resolved.resolution });
};
