# Kenya Sports Predictor

A full-stack React + Tailwind CSS and Node.js + Express sports prediction dashboard built for Kenyan bettors. The prototype uses free/freemium provider adapters only: API-Football is the primary football provider, The Odds API and Odds-API.io are backup odds providers, TheSportsDB enriches sports metadata and non-football browse data, Open-Meteo provides weather, and OddsPapi is optional for Mozzart Bet testing. Missing provider fields are labelled as missing, N/A, or provider not connected instead of being presented as real.

## Features

- Manual match search for Team A, Team B, and match date, with sport and league detected by the backend
- Guided match browsing by country, sport, fixture date, and real upcoming match card
- Current-day and future-date match APIs so users can select a fixture from the calendar and generate predictions immediately
- Backend prediction route for 1X2, Double Chance, BTTS, Over/Under 2.5, and Correct Score
- Weighted scoring model:
  - Recent form: 25%
  - Head-to-head: 15%
  - Home/away performance: 15%
  - League position/ranking: 10%
  - Injuries/team news: 10%
  - Prediction-source consensus: 15%
  - Bookmaker odds: 10%
- Confidence meter and prediction result cards
- Odds comparison table with API-Football first, then The Odds API, Odds-API.io, and optional OddsPapi fallback
- Value bet card
- Collapsible reasoning section
- LocalStorage saved prediction history
- Optional account login/register with database-synced saved prediction history
- Adapter-based backend folders for sports stats, bookmaker odds, prediction sources, weather, injuries, AI analysis, and scoring
- Provider fallback status so users can see what is real, missing, or waiting for a key/direct feed
- Data-quality badge showing real, missing, and estimated signals
- Client and server validation with field-level errors
- Confidence color coding: green for 75%+, yellow for 55%-74%, red below 55%
- Responsible gambling warning and no automatic bet placement
- 18+ age confirmation, responsible-play guidance, privacy/terms summaries
- Backend request IDs, CSP/security headers, rate limiting, CORS allow-list, SQLite persistence, protected admin analytics, and structured logs

## Setup

```bash
cd outputs/kenya-sports-predictor
npm install
copy .env.example .env
npm run dev
```

The frontend runs on:

```text
http://127.0.0.1:5173
```

The backend runs on:

```text
http://127.0.0.1:5000
```

Run checks:

```bash
npm run test
npm run build
npm audit --audit-level=moderate
```

## Free/Freemium Provider Setup

The backend tries providers in this order:

1. API-Football
2. The Odds API
3. Odds-API.io
4. TheSportsDB
5. Open-Meteo
6. OddsPapi, optional Mozzart Bet testing only

API-Football is the main football provider for countries, leagues, teams, fixtures, standings, H2H, lineups, injuries, statistics, predictions, and odds where your API plan supports those endpoints.

```text
API_FOOTBALL_KEY=your_key_here
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_SEASON=
```

TheSportsDB is used for sports metadata, countries, teams, events, badges/logos, and fallback/non-football browse enrichment:

```text
THESPORTSDB_API_KEY=your_key_here
```

Open-Meteo does not need a key. It uses the venue/city coordinates available for a fixture; if no coordinates can be resolved, weather remains missing/estimated instead of invented.

### Odds Providers

The odds table first tries API-Football odds for a matched fixture. If no usable odds are returned, it tries The Odds API and then Odds-API.io. Without a configured key or matching event, the API keeps the prediction flow working but marks odds as unavailable and does not invent bookmaker prices.

1. Get an API key from [The Odds API](https://the-odds-api.com/).
2. Copy `.env.example` to `.env`.
3. Set:

```text
ODDS_API_KEY=your_key_here
ODDS_API_REGIONS=uk,eu
ODDS_API_MARKETS=h2h,totals
ODDS_BOOKMAKER_VIEW=kenya
KENYA_ODDS_API_BOOKMAKERS=sportpesa,betika,odibets,mozzartbet,betpawa,betway,onexbet
```

Optional:

```text
ODDS_API_BOOKMAKERS=betfair,williamhill
ODDS_API_IO_KEY=your_odds_api_io_key_here
ODDSPAPI_ENABLED=false
ODDSPAPI_KEY=your_oddspapi_key_here
ODDSPAPI_TOURNAMENT_IDS=
```

Coverage depends on the provider and plan. Kenya-specific bookmakers may require a different odds provider, direct bookmaker feed, or paid partner feed.

The default Kenya bookmaker view requests common Kenyan-facing brands. If a real provider returns live prices for a brand, the odds table shows it as `Live odds`. If the provider has no prices for that brand, the app keeps the bookmaker visible and marks it as `Direct feed needed` or `Provider not connected` instead of inventing odds. SportPesa, Betika, Odibets and BetPawa must stay `Direct feed needed` until a real direct feed or provider returns those exact prices.

## Data Quality

Each prediction response includes a `dataQuality` object. The UI displays it as a badge so users can see:

- `real`: provider data was returned
- `missing`: no provider is configured or no provider data was returned
- `estimated`: neutral estimates were used because a provider field was unavailable

Injuries/team news, BTTS, Over/Under, Kenyan bookmaker odds, and league ranking can still be `missing` or `N/A` when a free/freemium provider does not return that field for a fixture. Prediction-source consensus comes from API-Football predictions when available, then from real odds-derived signals where available.

## Production Hardening

This project now includes production-test guardrails:

- `CLIENT_ORIGINS` to restrict browser origins
- `JSON_BODY_LIMIT` to cap request body size
- `TRUST_PROXY` for deployment behind a reverse proxy
- request IDs on API responses
- rate limiting on prediction and analytics endpoints
- CSP/security headers
- SQLite database persistence for users, sessions, history, analytics, and provider status snapshots
- protected analytics summary requiring `x-admin-token`
- database analytics through `POST /api/analytics/events`
- age gate and responsible gambling UI

Before a real public launch, follow [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

## API

### POST `/api/predict`

Example body:

```json
{
  "teamA": "Gor Mahia",
  "teamB": "AFC Leopards",
  "matchDate": "2026-06-20"
}
```

### GET `/api/sources/status`

Returns source availability and the provider fallback order. Bookmaker odds will show `needs_config` until `API_FOOTBALL_KEY`, `ODDS_API_KEY`, `ODDS_API_IO_KEY`, or optional `ODDSPAPI_*` settings are configured and a provider returns matching odds.

### POST `/api/analytics/events`

Stores privacy-friendly product events for production testing.

Example body:

```json
{
  "eventName": "prediction_requested",
  "sessionId": "local-session-id",
  "payload": {
    "sport": "Football",
    "league": "FIFA World Cup"
  }
}
```

### GET `/api/analytics/summary`

Returns analytics counts. This endpoint always requires `x-admin-token` matching `ANALYTICS_ADMIN_TOKEN`.

### POST `/api/auth/register`

Creates a user account for saved prediction sync.

### POST `/api/auth/login`

Returns a bearer token for protected user routes.

### GET `/api/user/history`

Returns saved predictions for the authenticated user.

### GET `/api/fixtures/today`

Returns current-day fixtures from the sports stats adapter.

Optional query:

```text
/api/fixtures/today?date=2026-06-12
```

### GET `/api/matches/countries`

Returns browseable countries and match counts.

### GET `/api/matches/sports?country=Kenya`

Returns sports available for a selected country.

### GET `/api/matches?country=Kenya&sport=Football&date=2026-06-12`

Returns match cards for the selected country, sport, and date. Each match can be sent to `POST /api/predict`.

## Backend Adapter Layout

- `server/services/sportsStats`
- `server/services/bookmakerOdds`
- `server/services/predictionSources`
- `server/services/weather`
- `server/services/injuries`
- `server/services/aiAnalysis`
- `server/services/scoring`

Each prediction service has an `index.js` file that exports the function used by the route and an adapter implementation beside it. Missing data is labelled and treated neutrally rather than replaced with fake values.

## Extend Later

- Add richer sports data providers inside `server/services/sportsStats`
- API-Football fixtures are fetched first in `server/services/matchProviders/apiFootballMatchProvider.js`; TheSportsDB remains a fallback/enrichment source in `server/services/matchService.js`
- Add direct bookmaker APIs or partner adapters inside `server/services/bookmakerOdds`
- Add licensed injury/team-news providers inside `server/services/injuries`
- Replace local deterministic analysis with a reviewed AI provider inside `server/services/aiAnalysis`
- Keep route contracts stable in `server/routes/predictRoutes.js`

## Responsible Gambling

Predictions are informational only. Betting involves risk. This app does not place bets, does not automate betting activity, and does not promise guaranteed wins.
