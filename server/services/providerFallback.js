export const providerFallbackOrder = [
  {
    id: 'api-football',
    name: 'API-Football',
    role: 'Primary football provider for fixtures, countries, leagues, teams, standings, H2H, lineups, injuries, statistics, predictions, and odds when available.',
  },
  {
    id: 'the-odds-api',
    name: 'The Odds API',
    role: 'Backup odds provider for global bookmaker odds and extra markets when available.',
  },
  {
    id: 'odds-api-io',
    name: 'Odds-API.io',
    role: 'Backup odds provider for event and bookmaker odds where a free/freemium key is configured.',
  },
  {
    id: 'thesportsdb',
    name: 'TheSportsDB',
    role: 'Sports metadata, countries, teams, events, badges, logos, and non-football browse enrichment.',
  },
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    role: 'Free weather provider using venue or city coordinates.',
  },
  {
    id: 'oddspapi',
    name: 'OddsPapi',
    role: 'Optional Mozzart Bet odds testing adapter only when explicitly enabled.',
  },
];
