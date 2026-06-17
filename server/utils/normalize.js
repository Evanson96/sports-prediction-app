export const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(fc|cf|sc|afc|the|club|sporting)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const nameScore = (left, right) => {
  const a = normalizeName(left);
  const b = normalizeName(right);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;

  const leftTokens = new Set(a.split(' ').filter((token) => token.length > 1));
  const rightTokens = new Set(b.split(' ').filter((token) => token.length > 1));
  const hits = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return hits / Math.max(leftTokens.size, rightTokens.size, 1);
};
