# Production Checklist

Use this checklist before a public launch.

## Must Complete Before Launch

- Configure `API_FOOTBALL_KEY` and verify fixtures, standings, H2H, injuries, lineups, statistics, predictions, and odds for the main football leagues users will browse.
- Configure `ODDS_API_KEY` and optional `ODDS_API_IO_KEY` only as backup odds sources, then verify real odds for the main leagues users will browse.
- Keep OddsPapi disabled unless you have a real Mozzart Bet testing key and tournament IDs.
- Keep SportPesa, Betika, Odibets and BetPawa labelled `Direct feed required` until a real direct or partner feed is connected.
- Connect licensed injuries/team-news and confirmed-lineups feeds where API-Football/free tiers do not return them.
- Connect richer standings/ranking/team-stat feeds for sports and leagues where free/freemium data is incomplete.
- Deploy behind HTTPS with `NODE_ENV=production`, `TRUST_PROXY=true`, and a locked-down `CLIENT_ORIGINS` value.
- Move SQLite to Postgres or another managed database before scaling beyond a single production-test instance.
- Add full legal pages reviewed for Kenya: Terms, Privacy Policy, Responsible Gambling, age restriction, and data-retention policy.
- Complete regulatory review for Kenya betting/gambling-advertising requirements before marketing the product.
- Complete ODPC/data-protection review before collecting accounts, phone numbers, emails, or other personal data.
- Add monitoring, uptime checks, error tracking, log retention, and alerting.
- Add a managed database before introducing user accounts, saved server history, subscriptions, or admin workflows.

## Already Implemented In This Codebase

- API-Football-first provider adapters for football fixtures, stats, standings, H2H, injuries, predictions, and odds where available.
- TheSportsDB fallback/enrichment for sports metadata, countries, teams, events, badges/logos, and non-football browse data.
- Real bookmaker odds fallback through The Odds API and Odds-API.io when keys are configured.
- Optional OddsPapi adapter for Mozzart Bet testing only.
- Clear missing-data labels when odds or provider fields are unavailable.
- 18+ age confirmation gate.
- Responsible gambling warning and no bet-placement flow.
- Privacy-friendly database analytics endpoint for production testing.
- Basic auth, protected user history, protected admin analytics, SQLite persistence, rate limiting, request IDs, CORS allow-list, JSON body size limit, CSP, and security headers.
- Mobile-first UI, saved browser history, browse flow, manual search flow, and confidence color coding.

## Suggested Launch Phases

1. Private staging: internal testing with API keys and logs.
2. Closed beta: 20-50 Kenyan users, collect analytics and feedback.
3. Compliance review: legal, privacy, data protection, and marketing copy.
4. Public launch: monitor API costs, prediction latency, fixture coverage, and user retention.
