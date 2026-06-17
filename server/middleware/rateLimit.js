const buckets = new Map();
const maxBuckets = Number(process.env.RATE_LIMIT_MAX_BUCKETS || 5000);

const getClientKey = (req) => {
  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
};

const cleanupBucket = (bucket, now, windowMs) => {
  while (bucket.length && now - bucket[0] > windowMs) {
    bucket.shift();
  }
};

export const createRateLimiter = ({ windowMs = 60_000, max = 60, message = 'Too many requests. Please slow down.' } = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.method}:${req.path}:${getClientKey(req)}`;
    const bucket = buckets.get(key) || [];
    cleanupBucket(bucket, now, windowMs);

    if (buckets.size > maxBuckets) {
      for (const [bucketKey, entries] of buckets.entries()) {
        cleanupBucket(entries, now, windowMs);
        if (entries.length === 0) buckets.delete(bucketKey);
        if (buckets.size <= maxBuckets) break;
      }
    }

    if (bucket.length >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - bucket[0])) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: message,
        requestId: req.id,
        retryAfterSeconds,
      });
      return;
    }

    bucket.push(now);
    buckets.set(key, bucket);
    next();
  };
};
