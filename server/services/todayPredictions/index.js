import { getTodayAvailableMatches } from '../matchService.js';
import { buildPredictionResponse } from '../predictionEngine/index.js';
import { getSourceStatus } from '../sourceStatus.js';
import { createMemoryCache } from '../../utils/cache.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const CACHE_MS = Number(process.env.TODAY_PREDICTIONS_CACHE_MS || 10 * 60 * 1000);
const DEFAULT_ANALYSIS_LIMIT = Number(process.env.TODAY_ANALYSIS_LIMIT || 12);
const MAX_ANALYSIS_LIMIT = Number(process.env.TODAY_MAX_ANALYSIS_LIMIT || 24);
const ANALYSIS_CONCURRENCY = clamp(Number(process.env.TODAY_ANALYSIS_CONCURRENCY || 2), 1, 4);
const cache = createMemoryCache({ ttlMs: CACHE_MS, maxEntries: 80 });

const sectionLabels = {
  recommended: 'Recommended slips',
  valuePicks: 'Value picks',
  researchOnly: 'Research-only picks',
  insufficientData: 'Insufficient data',
  accumulators: 'Accumulator ideas',
};

const sectionOrder = ['recommended', 'valuePicks', 'researchOnly', 'insufficientData', 'accumulators'];

const realStatuses = new Set(['real', 'partial_real', 'derived_real']);

const analysisLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return DEFAULT_ANALYSIS_LIMIT;
  return clamp(Math.round(parsed), 1, MAX_ANALYSIS_LIMIT);
};

const normalizeSport = (sport) =>
  String(sport || '')
    .toLowerCase()
    .trim();

const isFootball = (sport) => ['football', 'soccer'].includes(normalizeSport(sport));
const isCricket = (sport) => normalizeSport(sport) === 'cricket';

const hasRealMarketOdds = (prediction) =>
  prediction.oddsSource?.mode === 'real-api' &&
  (prediction.oddsComparison || []).some((row) =>
    Object.values(row.markets || {}).some((value) => typeof value === 'number' && Number.isFinite(value)),
  );

const hasPredictionSource = (prediction) =>
  realStatuses.has(prediction.predictionSource?.dataQuality?.status) &&
  (prediction.predictionSource?.sources || []).length > 0;

const hasRecentStats = (prediction) => {
  const stats = prediction.statsSource;
  const homeEvents = Number(stats?.teams?.home?.sourceEvents || 0);
  const awayEvents = Number(stats?.teams?.away?.sourceEvents || 0);
  return realStatuses.has(stats?.dataQuality?.status) && homeEvents + awayEvents > 0;
};

const hasStandings = (prediction) => Boolean(prediction.statsSource?.standingsAvailable);

const hasTeamNews = (prediction) =>
  realStatuses.has(prediction.teamNews?.dataQuality?.status) && prediction.teamNews?.mode !== 'missing';

const getSignalAvailability = (prediction) => {
  const sport = prediction.sport;
  const signals = {
    bookmakerOdds: hasRealMarketOdds(prediction),
    predictionSources: hasPredictionSource(prediction),
    recentFormStats: hasRecentStats(prediction),
    standingsRankings: hasStandings(prediction),
    teamNews: hasTeamNews(prediction),
  };
  const missing = [];
  const notAvailable = [];

  if (!signals.bookmakerOdds) missing.push('bookmakerOdds');
  if (!signals.predictionSources) missing.push('predictionSources');
  if (!signals.recentFormStats) missing.push('recent form/stats');
  if (!signals.standingsRankings) {
    if (isFootball(sport)) missing.push('standings/rankings');
    else notAvailable.push('standings/rankings');
  }
  if (!signals.teamNews) {
    if (isCricket(sport)) {
      notAvailable.push('Team news / squad availability');
    } else if (!isFootball(sport)) {
      notAvailable.push('team availability');
    } else {
      missing.push('injuries/team news');
    }
  }

  const relevantSignals = [
    signals.bookmakerOdds,
    signals.predictionSources,
    signals.recentFormStats,
    signals.standingsRankings,
    signals.teamNews,
  ];
  const count = relevantSignals.filter(Boolean).length;

  return {
    ...signals,
    count,
    missing,
    notAvailable,
    hasEnoughSignals: count >= 2,
    blockedByMissingCoreSignals: !signals.bookmakerOdds && !signals.predictionSources,
  };
};

const confidenceBand = (confidence) => {
  if (confidence >= 75) {
    return {
      key: 'strongest',
      label: 'Strongest available signal',
      title: 'Strongest available signal',
      dataQualityStatus: 'real',
    };
  }
  if (confidence >= 65) {
    return {
      key: 'high',
      label: 'High confidence',
      title: 'Higher-confidence signal based on available data',
      dataQualityStatus: 'partial_real',
    };
  }
  if (confidence >= 50) {
    return {
      key: 'medium',
      label: 'Medium confidence',
      title: 'Moderate signal',
      dataQualityStatus: 'partial_real',
    };
  }
  return {
    key: 'low',
    label: 'Low confidence / research only',
    title: 'Low-confidence research only',
    dataQualityStatus: 'insufficient',
  };
};

const bestOddsForPrediction = (prediction, market, pick) => {
  const rows = prediction.oddsComparison || [];
  const [teamA, teamB] = String(prediction.match || '').split(' vs ');
  const lowerPick = String(pick || '').toLowerCase();
  const marketKey =
    market === 'Over/Under 2.5' || market === 'Over/Under goals'
      ? lowerPick.includes('under')
        ? 'under25'
        : 'over25'
      : market === 'Both Teams To Score'
        ? lowerPick.includes('no')
          ? 'bttsNo'
          : 'bttsYes'
        : market === '1X2' || market === 'Match Winner'
          ? lowerPick.includes('draw')
            ? 'draw'
            : lowerPick.includes(String(teamB || '').toLowerCase())
              ? 'awayWin'
              : lowerPick.includes(String(teamA || '').toLowerCase())
                ? 'homeWin'
                : null
          : null;

  if (!marketKey) return { odds: null, bookmaker: null };

  return rows.reduce(
    (best, row) => {
      const odds = row.markets?.[marketKey];
      if (typeof odds !== 'number') return best;
      if (!best.odds || odds > best.odds) {
        return { odds, bookmaker: row.bookmaker };
      }
      return best;
    },
    { odds: null, bookmaker: null },
  );
};

const pickWinnerName = (prediction, pick) => {
  const [teamA = '', teamB = ''] = String(prediction.match || '').split(' vs ');
  const lowerPick = String(pick || '').toLowerCase();

  if (lowerPick.includes('draw')) return null;
  if (lowerPick.includes(teamB.toLowerCase())) return teamB;
  if (lowerPick.includes(teamA.toLowerCase())) return teamA;
  return lowerPick.includes('away') ? teamB : teamA;
};

const marketAllowedForSport = (sport, market) => {
  if (isFootball(sport)) {
    return ['1X2', 'Double Chance', 'Both Teams To Score', 'Over/Under 2.5', 'Over/Under goals', 'Draw No Bet'].includes(market);
  }

  if (isCricket(sport)) {
    return ['Match Winner', 'Toss Winner', 'Total Runs Over/Under', 'Top Batter', 'Top Bowler'].includes(market);
  }

  return ['Match Winner'].includes(market);
};

const getCandidatePicks = ({ match, prediction }) => {
  const byMarket = new Map((prediction.predictions || []).map((item) => [item.market, item]));
  const candidates = [];

  if (isFootball(prediction.sport)) {
    [
      byMarket.get('Double Chance'),
      byMarket.get('1X2'),
      byMarket.get('Over/Under 2.5'),
      byMarket.get('Both Teams To Score'),
    ]
      .filter(Boolean)
      .forEach((pick) => {
        candidates.push({
          market: pick.market === 'Over/Under 2.5' ? 'Over/Under goals' : pick.market,
          pick: pick.pick,
          confidence: pick.confidence,
          sourceMarket: pick.market,
        });
      });
    return candidates.filter((pick) => marketAllowedForSport(prediction.sport, pick.sourceMarket));
  }

  if (isCricket(prediction.sport)) {
    const main = byMarket.get('1X2') || prediction.mainPrediction;
    const winner = pickWinnerName(prediction, main?.pick);
    if (winner) {
      candidates.push({
        market: 'Match Winner',
        pick: `${winner} to win`,
        confidence: main?.confidence || 45,
        sourceMarket: '1X2',
      });
    }
    return candidates.filter((pick) => marketAllowedForSport(match.sport || prediction.sport, pick.market));
  }

  const main = byMarket.get('1X2') || prediction.mainPrediction;
  const winner = pickWinnerName(prediction, main?.pick);
  if (winner) {
    candidates.push({
      market: 'Match Winner',
      pick: `${winner} to win`,
      confidence: main?.confidence || 45,
      sourceMarket: '1X2',
    });
  }

  return candidates;
};

const confidenceWithQuality = (confidence, signals, { oddsRequired = false } = {}) => {
  const penalty =
    (!signals.hasEnoughSignals ? 12 : 0) +
    (signals.blockedByMissingCoreSignals ? 12 : 0) +
    (!signals.bookmakerOdds ? 5 : 0) +
    (!signals.predictionSources ? 4 : 0) +
    (!signals.recentFormStats ? 3 : 0) +
    (oddsRequired && !signals.bookmakerOdds ? 12 : 0);

  return Math.round(clamp((confidence || 50) - penalty, 18, 88));
};

const dataQualityForSignals = (signals, confidence) => {
  if (!signals.hasEnoughSignals || signals.blockedByMissingCoreSignals) return 'insufficient';
  if (confidence >= 75 && signals.bookmakerOdds && signals.predictionSources) return 'real';
  if (signals.count >= 2) return 'partial_real';
  return 'not_available';
};

const reasonForLeg = ({ prediction, pick, odds, signals, recommended }) => {
  const unavailableTeamNews = signals.notAvailable.length
    ? ` ${signals.notAvailable.join(', ')} not available from connected providers.`
    : '';
  const missingText = signals.missing.length ? ` Missing: ${signals.missing.join(', ')}.` : '';
  const oddsText = odds ? ` Best available odds snapshot is ${odds.toFixed(2)}.` : ' Odds unavailable from connected providers.';

  if (!signals.hasEnoughSignals || signals.blockedByMissingCoreSignals) {
    return `Not enough verified data to generate a reliable slip for this match.${oddsText}${missingText}${unavailableTeamNews}`;
  }

  if (!recommended) {
    return `${confidenceBand(pick.confidence).title}. This is research only, not a recommended slip.${oddsText}${missingText}${unavailableTeamNews}`;
  }

  return `${confidenceBand(pick.confidence).title}. AI research suggestion based on available signals.${oddsText}${missingText}${unavailableTeamNews}`;
};

const toLeg = ({ prediction, match, pick, signals, oddsRequired = false, recommended = false }) => {
  if (!marketAllowedForSport(prediction.sport, pick.market)) return null;

  const odds = bestOddsForPrediction(prediction, pick.sourceMarket || pick.market, pick.pick);
  const confidence = confidenceWithQuality(pick.confidence, signals, { oddsRequired });
  const band = confidenceBand(confidence);

  return {
    id: `${match.id || prediction.match}-${pick.market}-${pick.pick}`.replace(/\s+/g, '-').toLowerCase(),
    match: prediction.match,
    teamA: match.teamA,
    teamB: match.teamB,
    sport: prediction.sport,
    league: prediction.league,
    country: match.country || prediction.matchResolution?.country || 'N/A',
    matchDate: prediction.matchDate,
    kickoffTime: match.kickoffTime || prediction.matchResolution?.kickoffTime || 'TBA',
    market: pick.market,
    pick: pick.pick,
    confidence,
    confidenceBand: band.key,
    confidenceLabel: band.label,
    odds: odds.odds,
    bookmaker: odds.bookmaker,
    reason: reasonForLeg({ prediction, pick: { ...pick, confidence }, odds: odds.odds, signals, recommended }),
    dataQuality: {
      status: dataQualityForSignals(signals, confidence),
      score: confidence,
      real: [
        signals.bookmakerOdds ? 'bookmaker odds' : null,
        signals.predictionSources ? 'prediction source' : null,
        signals.recentFormStats ? 'recent form/stats' : null,
        signals.standingsRankings ? 'standings/rankings' : null,
        signals.teamNews ? (isCricket(prediction.sport) ? 'team news / squad availability' : 'injuries/team news') : null,
      ].filter(Boolean),
      missing: signals.missing,
      notAvailable: signals.notAvailable,
      estimated: prediction.dataQuality?.estimated || [],
    },
    sourceSummary: prediction.sourceSummary,
  };
};

const toSlip = ({ key, title, kind = 'single', legs, note, forceDataQuality = null }) => {
  const cleanLegs = legs.filter(Boolean);
  const confidence = cleanLegs.length
    ? Math.round(cleanLegs.reduce((sum, leg) => sum + (leg.confidence || 0), 0) / cleanLegs.length)
    : 0;
  const combinedOdds = cleanLegs.length && cleanLegs.every((leg) => typeof leg.odds === 'number')
    ? Number(cleanLegs.reduce((total, leg) => total * leg.odds, 1).toFixed(2))
    : null;
  const band = confidenceBand(confidence);
  const real = new Set();
  const missing = new Set();
  const notAvailable = new Set();
  const estimated = new Set();

  cleanLegs.forEach((leg) => {
    leg.dataQuality.real?.forEach((item) => real.add(item));
    leg.dataQuality.missing?.forEach((item) => missing.add(item));
    leg.dataQuality.notAvailable?.forEach((item) => notAvailable.add(item));
    leg.dataQuality.estimated?.forEach((item) => estimated.add(item));
  });

  return {
    id: `${key}-${cleanLegs.map((leg) => leg.id).join('-')}`.slice(0, 140),
    title,
    kind,
    confidence,
    confidenceBand: band.key,
    confidenceLabel: band.label,
    combinedOdds,
    legs: cleanLegs,
    note:
      note ||
      'AI research suggestion only. This is not a guaranteed bet and should be checked against live odds and late team news.',
    dataQuality: {
      status: forceDataQuality || band.dataQualityStatus,
      score: confidence,
      real: [...real],
      missing: [...missing],
      notAvailable: [...notAvailable],
      estimated: [...estimated],
    },
  };
};

const insufficientSlip = ({ match, prediction, signals }) =>
  toSlip({
    key: 'insufficient-data',
    title: 'Insufficient verified data',
    kind: 'insufficient',
    forceDataQuality: 'insufficient',
    note: 'This match is visible for research, but it is not used as a recommended betting slip.',
    legs: [
      {
        id: `${match.id || prediction.match}-insufficient-data`,
        match: prediction.match,
        teamA: match.teamA,
        teamB: match.teamB,
        sport: prediction.sport,
        league: prediction.league,
        country: match.country || 'N/A',
        matchDate: prediction.matchDate,
        kickoffTime: match.kickoffTime || 'TBA',
        market: 'Provider data check',
        pick: 'No recommended betting slip',
        confidence: 0,
        confidenceBand: 'low',
        confidenceLabel: 'Low confidence / research only',
        odds: null,
        bookmaker: null,
        reason: `Not enough verified data to generate a reliable slip. ${
          signals.bookmakerOdds
            ? 'Real odds were found, but the other verified signals are still too limited.'
            : 'Odds unavailable from connected providers.'
        }${
          signals.blockedByMissingCoreSignals ? ' Bookmaker odds and prediction sources are both missing.' : ''
        }${signals.missing.length ? ` Missing: ${signals.missing.join(', ')}.` : ''}${
          signals.notAvailable.length ? ` ${signals.notAvailable.join(', ')} not available from connected providers.` : ''
        }`,
        dataQuality: {
          status: 'insufficient',
          score: 0,
          real: [],
          missing: signals.missing,
          notAvailable: signals.notAvailable,
          estimated: [],
        },
      },
    ],
  });

const addSlip = (groups, groupKey, slip) => {
  if (!slip) return;
  groups[groupKey].items.push(slip);
};

const sortSection = (section) => ({
  ...section,
  items: section.items.sort((a, b) => b.confidence - a.confidence).slice(0, section.limit || 12),
});

const buildAccumulatorSlips = (groups) => {
  const eligibleLegs = [...groups.recommended.items, ...groups.valuePicks.items]
    .flatMap((item) => item.legs || [])
    .filter((leg) => typeof leg.odds === 'number' && leg.dataQuality?.status !== 'insufficient');
  const ideas = [];

  if (eligibleLegs.length >= 2) {
    ideas.push(
      toSlip({
        key: 'recommended-acca',
        title: 'Recommended accumulator watchlist',
        kind: 'accumulator',
        legs: eligibleLegs.slice(0, 3),
        note: 'Accumulator idea built only from legs with real odds. Still not guaranteed.',
      }),
    );
  }

  return ideas;
};

const addValuePicks = ({ groups, match, prediction, signals }) => {
  if (!signals.bookmakerOdds) return;

  (prediction.valueBets || []).forEach((valueBet) => {
    const market = isCricket(prediction.sport) && valueBet.market === '1X2' ? 'Match Winner' : valueBet.market;
    if (!marketAllowedForSport(prediction.sport, market)) return;

    const pick = {
      market,
      sourceMarket: valueBet.market,
      pick: market === 'Match Winner' ? `${pickWinnerName(prediction, valueBet.pick) || valueBet.pick} to win` : valueBet.pick,
      confidence: prediction.predictions?.find((item) => item.market === valueBet.market)?.confidence || prediction.mainPrediction?.confidence,
    };
    const leg = toLeg({ prediction, match, pick, signals, oddsRequired: true, recommended: true });

    if (leg?.odds) {
      addSlip(
        groups,
        'valuePicks',
        toSlip({
          key: 'value-pick',
          title: confidenceBand(leg.confidence).title,
          legs: [leg],
          note: 'Value pick watchlist using connected bookmaker odds. Verify the live market before staking.',
        }),
      );
    }
  });
};

const buildGroupedSlips = (analyses) => {
  const groups = Object.fromEntries(
    sectionOrder.map((key) => [
      key,
      {
        key,
        title: sectionLabels[key],
        items: [],
        limit: key === 'accumulators' ? 4 : 12,
      },
    ]),
  );

  analyses.forEach(({ match, prediction }) => {
    const signals = getSignalAvailability(prediction);
    const candidates = getCandidatePicks({ match, prediction });

    if (!signals.hasEnoughSignals || signals.blockedByMissingCoreSignals || candidates.length === 0) {
      addSlip(groups, 'insufficientData', insufficientSlip({ match, prediction, signals }));
      return;
    }

    candidates.forEach((pick) => {
      const projectedConfidence = confidenceWithQuality(pick.confidence, signals);
      const projectedBand = confidenceBand(projectedConfidence);
      const odds = bestOddsForPrediction(prediction, pick.sourceMarket || pick.market, pick.pick);
      const canRecommend = Boolean(odds.odds && projectedConfidence >= 50);
      const leg = toLeg({ prediction, match, pick, signals, recommended: canRecommend, oddsRequired: canRecommend });

      if (!leg) return;

      if (canRecommend) {
        addSlip(
          groups,
          'recommended',
          toSlip({
            key: 'recommended',
            title: projectedBand.title,
            legs: [leg],
            note: 'Recommended research slip based on available data and real odds. No outcome is guaranteed.',
          }),
        );
      } else {
        addSlip(
          groups,
          'researchOnly',
          toSlip({
            key: 'research-only',
            title: projectedBand.title,
            legs: [leg],
            note: odds.odds
              ? 'Research-only pick because the confidence signal is not strong enough for recommended slips.'
              : 'Research only because odds are unavailable from connected providers.',
          }),
        );
      }
    });

    addValuePicks({ groups, match, prediction, signals });
  });

  groups.accumulators.items = buildAccumulatorSlips(groups);

  return Object.fromEntries(sectionOrder.map((key) => [key, sortSection(groups[key])]));
};

const analyzeMatches = async (matches) => {
  const analyses = [];
  const skipped = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < matches.length) {
      const match = matches[cursor];
      cursor += 1;

      try {
        const prediction = await buildPredictionResponse(
          {
            teamA: match.teamA,
            teamB: match.teamB,
            sport: match.sport,
            league: match.league,
            matchDate: match.matchDate,
            country: match.country,
            venue: match.venue,
            kickoffTime: match.kickoffTime,
            providerFixtureId: match.providerFixtureId || '',
            providerLeagueId: match.providerLeagueId || '',
            providerSeason: match.providerSeason || '',
            providerHomeTeamId: match.providerHomeTeamId || '',
            providerAwayTeamId: match.providerAwayTeamId || '',
            homeLogo: match.homeLogo || '',
            awayLogo: match.awayLogo || '',
          },
          {
            resolution: {
              source: 'today-fixtures',
              confidence: 'verified-provider-fixture',
              country: match.country,
              kickoffTime: match.kickoffTime,
              providerFixtureId: match.providerFixtureId || null,
            },
          },
        );

        analyses.push({ match, prediction });
      } catch (error) {
        skipped.push({
          match: `${match.teamA} vs ${match.teamB}`,
          sport: match.sport,
          league: match.league,
          reason: error.message || 'Prediction analysis failed for this fixture.',
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(ANALYSIS_CONCURRENCY, matches.length) }, () => worker()));

  return { analyses, skipped };
};

export const getTodayPredictionSlips = async ({ date, sport = 'Football', limit } = {}) => {
  const normalizedSport = sport === 'All' ? 'All' : sport || 'Football';
  const maxToAnalyze = analysisLimit(limit);
  const cacheKey = `today-predictions:v2:${date}:${normalizedSport}:${maxToAnalyze}`;

  return cache.get(cacheKey, async () => {
    const [fixtureResult, providerStatus] = await Promise.all([
      getTodayAvailableMatches({ date, sport: normalizedSport, limit: Math.max(maxToAnalyze, 1) }),
      getSourceStatus().catch(() => null),
    ]);
    const matchesForAnalysis = fixtureResult.matches.slice(0, maxToAnalyze);
    const { analyses, skipped } = await analyzeMatches(matchesForAnalysis);
    const groups = buildGroupedSlips(analyses);
    const totalSlipCount = ['recommended', 'valuePicks', 'researchOnly', 'accumulators'].reduce(
      (count, key) => count + groups[key].items.length,
      0,
    );

    return {
      date,
      sport: normalizedSport,
      generatedAt: new Date().toISOString(),
      cache: {
        ttlMs: CACHE_MS,
        key: cacheKey,
      },
      matches: fixtureResult.matches,
      analyzedMatches: analyses.length,
      skippedMatches: skipped,
      provider: fixtureResult.provider,
      providerAttempts: fixtureResult.providerAttempts,
      providerStatus,
      groups,
      summary: {
        totalMatches: fixtureResult.matches.length,
        totalAvailable: fixtureResult.totalAvailable,
        totalSlipCount,
        insufficientCount: groups.insufficientData.items.length,
        analyzedLimit: maxToAnalyze,
        note:
          totalSlipCount > 0
            ? 'Recommended slips require enough useful signals and real odds. Weak or unsupported matches are moved to Research-only or Insufficient data.'
            : 'No reliable recommended slips could be generated from the connected providers for this date.',
      },
      emptyState:
        fixtureResult.matches.length === 0
          ? 'No available matches were returned by connected providers for today.'
          : totalSlipCount === 0
            ? "Not enough verified data to generate reliable slips from today's available matches."
            : '',
      riskWarning: 'AI research suggestions are informational only. Betting involves risk. No slip is guaranteed to win.',
    };
  });
};

export const getTodayPredictionsCacheStats = () => cache.stats();
export const buildTodaySlipGroupsForTest = buildGroupedSlips;
