export const unavailableInjuriesAdapter = {
  id: 'injuries-provider-unconfigured',
  name: 'Injuries Provider Adapter',
  type: 'injuries',
  async getTeamNews({ teamA, teamB, sport }) {
    const normalizedSport = String(sport || '').toLowerCase();
    const isFootball = ['football', 'soccer'].includes(normalizedSport);
    const availabilityLabel = normalizedSport === 'cricket' ? 'Team news / squad availability' : 'Team availability';
    const unavailableSummary = `${availabilityLabel} not available from connected providers.`;

    if (!isFootball) {
      return {
        provider: this.name,
        mode: 'not_available',
        dataQuality: {
          status: 'not_available',
          realFields: [],
          missingFields: [],
          notAvailableFields: [availabilityLabel],
          note: `${availabilityLabel} is not connected for ${sport || 'this sport'} yet. This factor is treated neutrally and is not presented as verified data.`,
        },
        home: {
          team: teamA,
          injuryImpact: null,
          summary: unavailableSummary,
        },
        away: {
          team: teamB,
          injuryImpact: null,
          summary: unavailableSummary,
        },
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      provider: this.name,
      mode: 'missing',
      dataQuality: {
        status: 'missing',
        realFields: [],
        missingFields: ['injuries', 'suspensions', 'confirmed team news'],
        note: 'No licensed injuries/team-news provider is configured. This factor is treated neutrally and lowers data quality.',
      },
      home: {
        team: teamA,
        injuryImpact: null,
        summary: 'Verified injury feed unavailable.',
      },
      away: {
        team: teamB,
        injuryImpact: null,
        summary: 'Verified injury feed unavailable.',
      },
      fetchedAt: new Date().toISOString(),
    };
  },
  async status() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: 'needs_config',
      mode: 'missing',
      updateCadence: 'Connect a licensed injuries/team-news API before public launch',
    };
  },
};
