export const kenyaBookmakerCatalog = [
  { key: 'sportpesa', title: 'SportPesa', directFeedRequired: true },
  { key: 'betika', title: 'Betika', directFeedRequired: true },
  { key: 'odibets', title: 'Odibets', directFeedRequired: true },
  { key: 'mozzartbet', title: 'Mozzart Bet', directFeedRequired: true },
  { key: 'betpawa', title: 'BetPawa', directFeedRequired: true },
  { key: 'betway', title: 'Betway', directFeedRequired: false },
  { key: 'onexbet', title: '1xBet', directFeedRequired: false },
];

export const kenyaBookmakerKeys = (process.env.KENYA_ODDS_API_BOOKMAKERS || kenyaBookmakerCatalog.map((book) => book.key).join(','))
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);

export const emptyMarkets = () => ({
  homeWin: null,
  draw: null,
  awayWin: null,
  over25: null,
  under25: null,
  totalsLine: null,
  bttsYes: null,
  bttsNo: null,
});

export const getKenyaBookmakerTitle = (key, fallbackTitle) =>
  kenyaBookmakerCatalog.find((bookmaker) => bookmaker.key === key)?.title || fallbackTitle || key;

export const normalizeBookmakerKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const buildMissingKenyaRows = (returnedKeys = new Set()) =>
  kenyaBookmakerKeys
    .filter((key) => !returnedKeys.has(normalizeBookmakerKey(key)))
    .map((key) => {
      const catalog = kenyaBookmakerCatalog.find((bookmaker) => bookmaker.key === key);
      return {
        bookmaker: getKenyaBookmakerTitle(key),
        key,
        lastUpdate: null,
        status: catalog?.directFeedRequired ? 'direct_feed_needed' : 'provider_not_connected',
        markets: emptyMarkets(),
      };
    });

export const decimalToProbability = (odds) => (typeof odds === 'number' && odds > 1 ? 100 / odds : null);

export const average = (values) => {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

export const getImpliedProbabilities = (rows) => {
  const home = average(rows.map((row) => decimalToProbability(row.markets.homeWin))) ?? 45;
  const draw = average(rows.map((row) => decimalToProbability(row.markets.draw))) ?? 25;
  const away = average(rows.map((row) => decimalToProbability(row.markets.awayWin))) ?? 100 - home - draw;
  const over25 = average(rows.map((row) => decimalToProbability(row.markets.over25))) ?? 50;
  const btts = average(rows.map((row) => decimalToProbability(row.markets.bttsYes))) ?? 50;

  return {
    home: Number(home.toFixed(1)),
    draw: Number(draw.toFixed(1)),
    away: Number(Math.max(1, away).toFixed(1)),
    over25: Number(over25.toFixed(1)),
    btts: Number(btts.toFixed(1)),
  };
};
