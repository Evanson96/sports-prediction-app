import { findMatchByTeamsAndDate } from '../matchService.js';

const kenyaFootballTeams = [
  'afc leopards',
  'bandari',
  'bidco united',
  'gor mahia',
  'kakamega homeboyz',
  'kenya police',
  'kariobangi sharks',
  'mathare united',
  'nairobi city stars',
  'shabana',
  'sofapaka',
  'talanta',
  'tusker',
  'ulinzi stars',
];

const worldFootballTeams = [
  'argentina',
  'brazil',
  'england',
  'france',
  'germany',
  'iran',
  'new zealand',
  'nigeria',
  'saudi arabia',
  'senegal',
  'spain',
  'uruguay',
  'usa',
];

const basketballTeams = [
  'boston celtics',
  'chicago bulls',
  'golden state warriors',
  'los angeles lakers',
  'miami heat',
  'new york knicks',
  'san antonio spurs',
];

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const includesKnownTeam = (teams, ...names) =>
  names.some((name) => teams.some((team) => normalize(name).includes(team) || team.includes(normalize(name))));

const fallbackContext = ({ teamA, teamB }) => {
  if (includesKnownTeam(kenyaFootballTeams, teamA, teamB)) {
    return {
      sport: 'Football',
      league: 'FKF Premier League',
      source: 'team-name-fallback',
      confidence: 'medium',
      note: 'League inferred from known Kenyan football teams because no exact fixture match was returned by the fixture provider.',
    };
  }

  if (includesKnownTeam(worldFootballTeams, teamA, teamB)) {
    return {
      sport: 'Football',
      league: 'International Football',
      source: 'team-name-fallback',
      confidence: 'medium',
      note: 'Sport inferred from national football team names because no exact fixture match was returned by the fixture provider.',
    };
  }

  if (includesKnownTeam(basketballTeams, teamA, teamB)) {
    return {
      sport: 'Basketball',
      league: 'NBA',
      source: 'team-name-fallback',
      confidence: 'medium',
      note: 'Sport and league inferred from known basketball team names because no exact fixture match was returned by the fixture provider.',
    };
  }

  return {
    sport: 'Football',
    league: 'Auto-detected Football Match',
    source: 'default-fallback',
    confidence: 'low',
    note: 'No exact fixture match was returned by the fixture provider, so the app defaulted to football. Use Browse Matches for the most reliable league detection.',
  };
};

export const resolveMatchInput = async (matchInput) => {
  if (matchInput.sport && matchInput.league) {
    return {
      matchInput,
      resolution: {
        source: 'provided',
        confidence: 'high',
        note: 'Sport and league came from the selected match.',
      },
    };
  }

  const fixtureMatch = await findMatchByTeamsAndDate(matchInput);

  if (fixtureMatch) {
    return {
      matchInput: {
        ...matchInput,
        teamA: fixtureMatch.teamA,
        teamB: fixtureMatch.teamB,
        sport: fixtureMatch.sport,
        league: fixtureMatch.league,
        matchDate: fixtureMatch.matchDate,
        country: fixtureMatch.country,
        venue: fixtureMatch.venue,
        kickoffTime: fixtureMatch.kickoffTime,
        providerFixtureId: fixtureMatch.providerFixtureId || '',
        providerLeagueId: fixtureMatch.providerLeagueId || '',
        providerSeason: fixtureMatch.providerSeason || '',
        providerHomeTeamId: fixtureMatch.providerHomeTeamId || '',
        providerAwayTeamId: fixtureMatch.providerAwayTeamId || '',
        homeLogo: fixtureMatch.homeLogo || '',
        awayLogo: fixtureMatch.awayLogo || '',
      },
      resolution: {
        source: fixtureMatch.source || fixtureMatch.provider || 'fixture-provider',
        confidence: fixtureMatch.matchScore >= 0.86 ? 'high' : 'medium',
        score: fixtureMatch.matchScore,
        country: fixtureMatch.country,
        kickoffTime: fixtureMatch.kickoffTime,
        providerFixtureId: fixtureMatch.providerFixtureId,
        providerLeagueId: fixtureMatch.providerLeagueId,
        providerSeason: fixtureMatch.providerSeason,
        providerHomeTeamId: fixtureMatch.providerHomeTeamId,
        providerAwayTeamId: fixtureMatch.providerAwayTeamId,
        note: `Sport and league detected from ${fixtureMatch.source || fixtureMatch.provider || 'fixture provider'} fixtures.`,
      },
    };
  }

  const fallback = fallbackContext(matchInput);

  return {
    matchInput: {
      ...matchInput,
      sport: matchInput.sport || fallback.sport,
      league: matchInput.league || fallback.league,
    },
    resolution: fallback,
  };
};
