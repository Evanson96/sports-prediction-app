const redactKeys = new Set(['password', 'token', 'authorization', 'apiKey', 'api_key', 'ODDS_API_KEY']);

const safePayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return payload;

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (redactKeys.has(key) || key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
        return [key, '[redacted]'];
      }

      if (value instanceof Error) {
        return [
          key,
          {
            name: value.name,
            message: value.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : value.stack,
          },
        ];
      }

      return [key, value];
    }),
  );
};

const write = (level, message, payload) => {
  const entry = {
    level,
    message,
    service: 'kenya-sports-predictor-api',
    at: new Date().toISOString(),
    ...safePayload(payload),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
};

export const logger = {
  info: (message, payload) => write('info', message, payload),
  warn: (message, payload) => write('warn', message, payload),
  error: (message, payload) => write('error', message, payload),
};
