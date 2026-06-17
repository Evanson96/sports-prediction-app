import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
process.env.API_FOOTBALL_KEY = '';
process.env.ODDS_API_KEY = '';
process.env.ODDS_API_IO_KEY = '';
process.env.ODDSPAPI_ENABLED = 'false';
process.env.ODDSPAPI_KEY = '';
process.env.THESPORTSDB_API_KEY = process.env.THESPORTSDB_API_KEY || '123';
process.env.ANALYTICS_ADMIN_TOKEN = 'test-admin-token-with-enough-length';
process.env.ANALYTICS_SALT = 'test-analytics-salt-with-enough-length';
process.env.SQLITE_PATH = path.join(os.tmpdir(), `kenya-sports-predictor-${Date.now()}.sqlite`);

const { createApp } = await import('../server/index.js');
const { buildTodaySlipGroupsForTest } = await import('../server/services/todayPredictions/index.js');
const { buildPrediction } = await import('../server/services/scoring/index.js');

let server;
let baseUrl;

const jsonRequest = async (pathName, options = {}) => {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      Origin: 'http://127.0.0.1:5173',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try {
    fs.rmSync(process.env.SQLITE_PATH, { force: true });
    fs.rmSync(`${process.env.SQLITE_PATH}-wal`, { force: true });
    fs.rmSync(`${process.env.SQLITE_PATH}-shm`, { force: true });
  } catch {
    // Test cleanup should not hide assertion failures.
  }
});

test('health endpoint works for allowed origin', async () => {
  const { response, data } = await jsonRequest('/api/health');
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
});

test('blocked CORS origin returns 403', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://blocked.example' },
  });
  const data = await response.json();
  assert.equal(response.status, 403);
  assert.match(data.error, /CORS/i);
});

test('browse flow endpoints return country, sport, and match lists', async () => {
  const countries = await jsonRequest('/api/matches/countries');
  assert.equal(countries.response.status, 200);
  assert.ok(Array.isArray(countries.data.countries));
  assert.ok(countries.data.countries.length > 0);

  const sports = await jsonRequest('/api/matches/sports?country=International');
  assert.equal(sports.response.status, 200);
  assert.ok(Array.isArray(sports.data.sports));
  assert.ok(sports.data.sports.some((item) => item.sport === 'Football'));

  const matches = await jsonRequest('/api/matches?country=International&sport=Football&date=2026-06-16');
  assert.equal(matches.response.status, 200);
  assert.ok(Array.isArray(matches.data.matches));
});

test('manual prediction validates invalid inputs', async () => {
  const { response, data } = await jsonRequest('/api/predict', {
    method: 'POST',
    body: JSON.stringify({
      teamA: 'Gor Mahia',
      teamB: 'Gor Mahia',
      matchDate: '2026-06-16',
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(data.details.teamB, 'Choose a different opponent');
});

test('manual prediction returns data quality and five markets', async () => {
  const { response, data } = await jsonRequest('/api/predict', {
    method: 'POST',
    body: JSON.stringify({
      teamA: 'France',
      teamB: 'Senegal',
      matchDate: '2026-06-16',
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(data.predictions.length, 5);
  assert.ok(data.dataQuality);
  assert.ok(['strong', 'mixed', 'limited'].includes(data.dataQuality.status));
  assert.ok(data.oddsComparison.some((row) => row.status === 'direct_feed_needed'));
  assert.match(data.reasoning, /unavailable|Missing|Provider not connected|N\/A/i);
  assert.ok(data.statsSource);
  assert.ok(data.teamNews);
  assert.ok(data.predictionSource);
});

test('source status exposes provider fallback order', async () => {
  const { response, data } = await jsonRequest('/api/sources/status');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data.providerFallbackOrder));
  assert.equal(data.providerFallbackOrder[0].id, 'api-football');
  assert.ok(data.sources.some((source) => source.id === 'bookmaker-odds'));
});

test('today predictions endpoint returns grouped research slips shape', async () => {
  const { response, data } = await jsonRequest('/api/predictions/today?date=2026-06-16&sport=Football&limit=1');

  assert.equal(response.status, 200);
  assert.equal(data.date, '2026-06-16');
  assert.ok(data.groups);
  assert.ok(data.groups.recommended);
  assert.ok(data.groups.researchOnly);
  assert.ok(data.groups.insufficientData);
  assert.ok(data.groups.accumulators);
  assert.ok(Array.isArray(data.matches));
  assert.ok(Array.isArray(data.providerAttempts));
  assert.ok(data.providerStatus);
  assert.match(data.riskWarning, /risk|guaranteed/i);
  assert.ok((data.groups.recommended.items || []).every((item) => item.kind === 'single'));
  assert.ok((data.groups.insufficientData.items || []).every((item) => item.kind === 'insufficient'));
});

test('cricket weak data is moved to insufficient data without football markets', () => {
  const groups = buildTodaySlipGroupsForTest([
    {
      match: {
        id: 'india-cricket-women-netherlands-cricket-women',
        teamA: 'India Cricket Women',
        teamB: 'Netherlands Cricket Women',
        sport: 'Cricket',
        league: 'International Cricket',
        country: 'International',
        matchDate: '2026-06-16',
        kickoffTime: '12:00',
      },
      prediction: {
        match: 'India Cricket Women vs Netherlands Cricket Women',
        sport: 'Cricket',
        league: 'International Cricket',
        matchDate: '2026-06-16',
        mainPrediction: { market: '1X2', pick: 'India Cricket Women Win', confidence: 35, level: 'Low' },
        predictions: [
          { market: '1X2', pick: 'India Cricket Women Win', confidence: 35, level: 'Low' },
          { market: 'Double Chance', pick: '1X', confidence: 35, level: 'Low' },
          { market: 'Both Teams To Score', pick: 'Yes', confidence: 35, level: 'Low' },
          { market: 'Over/Under 2.5', pick: 'Over 2.5', confidence: 35, level: 'Low' },
        ],
        oddsComparison: [],
        oddsSource: { mode: 'missing' },
        valueBets: [],
        dataQuality: {
          status: 'limited',
          score: 35,
          real: ['sportsStats'],
          missing: ['bookmakerOdds', 'predictionSources', 'injuries'],
          estimated: [],
        },
        statsSource: {
          dataQuality: { status: 'partial_real' },
          standingsAvailable: false,
          teams: {
            home: { sourceEvents: 2 },
            away: { sourceEvents: 2 },
          },
        },
        teamNews: {
          mode: 'missing',
          dataQuality: { status: 'missing' },
        },
        predictionSource: {
          dataQuality: { status: 'missing' },
          sources: [],
        },
        sourceSummary: {},
      },
    },
  ]);

  const allLegs = Object.values(groups).flatMap((group) => group.items.flatMap((item) => item.legs));
  assert.equal(groups.recommended.items.length, 0);
  assert.equal(groups.valuePicks.items.length, 0);
  assert.equal(groups.accumulators.items.length, 0);
  assert.equal(groups.insufficientData.items.length, 1);
  assert.ok(allLegs.every((leg) => leg.market !== 'Double Chance'));
  assert.ok(allLegs.every((leg) => leg.pick !== '1X'));
  assert.ok(groups.insufficientData.items[0].legs[0].reason.includes('Bookmaker odds and prediction sources are both missing'));
  assert.ok(groups.insufficientData.items[0].legs[0].dataQuality.notAvailable.includes('Team news / squad availability'));
});

test('scoring uses sport-specific markets for cricket predictions', () => {
  const result = buildPrediction(
    {
      teamA: 'India Cricket Women',
      teamB: 'Netherlands Cricket Women',
      sport: 'Cricket',
      league: 'International Cricket',
    },
    {
      sportsStats: {
        mode: 'missing',
        dataQuality: { status: 'missing' },
        teams: {
          home: { formScore: 50, homeStrength: 50, rating: 52 },
          away: { formScore: 50, awayStrength: 50, rating: 48 },
        },
        h2h: { teamAEdge: 50 },
        leagueProfile: { averageGoals: 2.2, drawRate: 20 },
      },
      bookmakerOdds: {
        sourceMode: 'missing',
        dataQuality: { status: 'missing' },
        impliedProbabilities: { home: 45, draw: 27, away: 28, over25: 50, btts: 50 },
        bookmakers: [],
      },
      predictionSources: {
        mode: 'missing',
        dataQuality: { status: 'missing' },
        homeConsensus: 50,
        awayConsensus: 50,
      },
      injuries: {
        mode: 'not_available',
        dataQuality: {
          status: 'not_available',
          notAvailableFields: ['Team news / squad availability'],
        },
        home: { injuryImpact: null },
        away: { injuryImpact: null },
      },
      weather: {
        mode: 'missing',
        dataQuality: { status: 'missing' },
        riskImpact: 0,
      },
    },
  );

  assert.equal(result.mainPrediction.market, 'Match Winner');
  assert.deepEqual(result.predictions.map((item) => item.market), ['Match Winner']);
  assert.ok(result.dataQuality.notAvailable.includes('injuries'));
});

test('today predictions endpoint validates dates', async () => {
  const { response, data } = await jsonRequest('/api/predictions/today?date=not-a-date');

  assert.equal(response.status, 400);
  assert.equal(data.details.date, 'Use YYYY-MM-DD');
});

test('analytics summary requires admin token', async () => {
  const withoutToken = await jsonRequest('/api/analytics/summary');
  assert.equal(withoutToken.response.status, 403);

  const withToken = await jsonRequest('/api/analytics/summary', {
    headers: { 'x-admin-token': process.env.ANALYTICS_ADMIN_TOKEN },
  });
  assert.equal(withToken.response.status, 200);
  assert.equal(withToken.data.mode, 'sqlite');
});

test('auth protects and persists user history', async () => {
  const protectedHistory = await jsonRequest('/api/user/history');
  assert.equal(protectedHistory.response.status, 401);

  const email = `tester-${Date.now()}@example.com`;
  const registered = await jsonRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'StrongPass123' }),
  });

  assert.equal(registered.response.status, 201);
  assert.ok(registered.data.token);

  const saved = await jsonRequest('/api/user/history', {
    method: 'POST',
    headers: { Authorization: `Bearer ${registered.data.token}` },
    body: JSON.stringify({
      prediction: {
        match: 'France vs Senegal',
        sport: 'Football',
        league: 'FIFA World Cup',
        matchDate: '2026-06-16',
        mainPrediction: { market: '1X2', pick: 'France Win', confidence: 62, level: 'Medium' },
      },
    }),
  });

  assert.equal(saved.response.status, 201);

  const history = await jsonRequest('/api/user/history', {
    headers: { Authorization: `Bearer ${registered.data.token}` },
  });

  assert.equal(history.response.status, 200);
  assert.equal(history.data.history.length, 1);
});
