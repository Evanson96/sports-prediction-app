import { providerFallbackOrder } from '../providerFallback.js';
import { apiFootballOddsAdapter } from './apiFootballOddsAdapter.js';
import { buildMissingKenyaRows } from './kenyaBookmakers.js';
import { oddsApiIoAdapter } from './oddsApiIoAdapter.js';
import { oddspapiAdapter } from './oddspapiAdapter.js';
import { theOddsApiAdapter } from './theOddsApiAdapter.js';

const providerChain = [
  theOddsApiAdapter,
  apiFootballOddsAdapter,
  oddsApiIoAdapter,
  oddspapiAdapter,
];

const getConfiguredProviders = () =>
  providerChain.filter((provider) => {
    if (provider.id === 'oddspapi-mozzartbet') {
      return provider.isConfigured();
    }

    return true;
  });

const unavailableOdds = ({ reason, matchInput, providerAttempts = [] }) => ({
  provider: 'Bookmaker Odds Adapter',
  sourceMode: 'missing',
  matchKey: `${matchInput.teamA}::${matchInput.teamB}::${matchInput.matchDate}`,
  impliedProbabilities: {
    home: 45,
    draw: 27,
    away: 28,
    over25: 50,
    btts: 50,
  },
  bookmakers: buildMissingKenyaRows(new Set()),
  fetchedAt: new Date().toISOString(),
  fallbackReason: reason,
  providerAttempts,
  fallbackOrder: providerFallbackOrder,
  note: 'Real bookmaker odds are unavailable for this match. Odds are not invented; the scoring engine uses neutral odds assumptions. SportPesa, Betika, Odibets and BetPawa remain marked as direct feed required until a real feed is connected.',
  dataQuality: {
    status: 'missing',
    realFields: [],
    missingFields: ['bookmaker odds', 'Kenyan direct bookmaker feeds'],
    note: reason,
  },
});

export const getBookmakerOdds = async (matchInput, sportsStats) => {
  const attempts = [];
  const providers = getConfiguredProviders();

  for (const provider of providers) {
    if (!provider.isConfigured()) {
      attempts.push({
        provider: provider.name,
        status: 'needs_config',
        reason: `${provider.name} is not configured.`,
      });
      continue;
    }

    try {
      const odds = await provider.getOdds(matchInput, sportsStats);
      return {
        ...odds,
        providerAttempts: [
          ...attempts,
          {
            provider: provider.name,
            status: 'used',
            sourceMode: odds.sourceMode,
          },
        ],
        fallbackOrder: providerFallbackOrder,
      };
    } catch (error) {
      attempts.push({
        provider: provider.name,
        status: 'failed',
        reason: error.message,
      });
    }
  }

  return unavailableOdds({
    matchInput,
    reason: 'No configured free/freemium odds provider returned a matching event with usable markets.',
    providerAttempts: attempts,
  });
};

export const getBookmakerOddsStatus = async () => {
  const providers = await Promise.all(providerChain.map((provider) => provider.status()));
  const hasConfiguredProvider = providers.some((provider) => provider.status === 'online');
  return {
    id: 'bookmaker-odds',
    name: 'Bookmaker Odds Fallback Chain',
    type: 'bookmaker-odds',
    status: hasConfiguredProvider ? 'online' : 'needs_config',
    mode: hasConfiguredProvider ? 'fallback-chain' : 'missing',
    updateCadence: hasConfiguredProvider
      ? 'Cached per provider; The Odds API first when connected, then API-Football odds fallback, then odds backups'
      : 'Set API_FOOTBALL_KEY, ODDS_API_KEY, ODDS_API_IO_KEY, or optional ODDSPAPI_* to enable odds',
    providers,
    fallbackOrder: providerFallbackOrder,
    kenyaBookmakers:
      'SportPesa, Betika, Odibets and BetPawa are direct-feed-required unless a connected provider returns real prices.',
  };
};
