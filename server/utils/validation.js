const validateBaseMatchFields = (body, requiredFields) => {
  const errors = {};
  const maxLengths = {
    teamA: 80,
    teamB: 80,
    sport: 40,
    league: 100,
    country: 60,
    venue: 120,
    kickoffTime: 20,
    providerFixtureId: 40,
    providerLeagueId: 40,
    providerSeason: 12,
    providerHomeTeamId: 40,
    providerAwayTeamId: 40,
  };

  for (const field of requiredFields) {
    if (!body?.[field] || !String(body[field]).trim()) {
      errors[field] = 'Required';
    }
  }

  Object.entries(maxLengths).forEach(([field, max]) => {
    if (body?.[field] && String(body[field]).trim().length > max) {
      errors[field] = `Use ${max} characters or fewer`;
    }
  });

  if (body?.teamA && body?.teamB && String(body.teamA).trim().toLowerCase() === String(body.teamB).trim().toLowerCase()) {
    errors.teamB = 'Choose a different opponent';
  }

  if (body?.matchDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.matchDate))) {
    errors.matchDate = 'Use YYYY-MM-DD';
  } else if (body?.matchDate && Number.isNaN(Date.parse(body.matchDate))) {
    errors.matchDate = 'Use a valid date';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      teamA: String(body?.teamA || '').trim(),
      teamB: String(body?.teamB || '').trim(),
      sport: String(body?.sport || '').trim(),
      league: String(body?.league || '').trim(),
      matchDate: String(body?.matchDate || '').trim(),
      country: String(body?.country || '').trim(),
      venue: String(body?.venue || '').trim(),
      kickoffTime: String(body?.kickoffTime || '').trim(),
      providerFixtureId: String(body?.providerFixtureId || '').trim(),
      providerLeagueId: String(body?.providerLeagueId || '').trim(),
      providerSeason: String(body?.providerSeason || '').trim(),
      providerHomeTeamId: String(body?.providerHomeTeamId || '').trim(),
      providerAwayTeamId: String(body?.providerAwayTeamId || '').trim(),
      homeLogo: String(body?.homeLogo || '').trim(),
      awayLogo: String(body?.awayLogo || '').trim(),
    },
  };
};

export const validateMatchSearchInput = (body) =>
  validateBaseMatchFields(body, ['teamA', 'teamB', 'matchDate']);

export const validateMatchInput = (body) =>
  validateBaseMatchFields(body, ['teamA', 'teamB', 'sport', 'league', 'matchDate']);
