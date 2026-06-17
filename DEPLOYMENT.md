# Deployment Notes

## Required Environment

- `NODE_ENV=production`
- `CLIENT_ORIGINS=https://your-frontend-domain.example`
- `TRUST_PROXY=true` when deployed behind a reverse proxy or platform load balancer
- `API_FOOTBALL_KEY` for primary football fixtures, standings, H2H, injuries, statistics, predictions, and odds where your plan supports them
- `THESPORTSDB_API_KEY` for sports metadata, logos/badges, teams, events, and fallback/non-football enrichment
- `ODDS_API_KEY` for backup bookmaker odds
- `ODDS_API_IO_KEY` for secondary backup odds if you want another free/freemium odds source
- `ODDSPAPI_ENABLED=false` unless you are testing Mozzart Bet odds with a real OddsPapi key and tournament IDs
- `DATABASE_URL=sqlite:/mounted-volume/app.sqlite` for production testing, or replace the database adapter with Postgres before scaling
- `ANALYTICS_SALT` as a long random value
- `ANALYTICS_ADMIN_TOKEN` as a long random value stored only in your secret manager

## Production Checks

```bash
npm install
npm run test
npm run build
npm audit --audit-level=moderate
```

## Notes Before Public Launch

- SQLite is suitable for a single-instance production test. Move users, history, analytics, and provider snapshots to Postgres or a managed database before high traffic.
- Exact SportPesa, Betika, Odibets and BetPawa odds must stay marked as direct-feed-required until a real provider or direct partner feed returns those prices.
- Injuries, BTTS, Over/Under, rankings, lineups and predictions may remain missing/N/A on free tiers when API-Football or a backup provider does not return them for a fixture.
- Rotate any API key that was pasted into chat, logs, screenshots, or a public repository before staging or production testing.
- Add platform monitoring, uptime checks, error tracking, backup policy, legal pages, and Kenya compliance review before marketing to the public.
