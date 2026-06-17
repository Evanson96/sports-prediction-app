import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import analyticsRoutes from './routes/analyticsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import fixtureRoutes from './routes/fixtureRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import predictRoutes from './routes/predictRoutes.js';
import sourceRoutes from './routes/sourceRoutes.js';
import todayPredictionRoutes from './routes/todayPredictionRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const originAllowed = (origin) => !origin || CLIENT_ORIGINS.includes('*') || CLIENT_ORIGINS.includes(origin);

const enforceCorsOrigin = (req, res, next) => {
  const origin = req.get('origin');
  if (!originAllowed(origin)) {
    res.status(403).json({
      error: 'CORS origin not allowed.',
      requestId: req.id,
    });
    return;
  }
  next();
};

const requestLogger = (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('request_completed', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
};

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(requestId);
  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(enforceCorsOrigin);
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, originAllowed(origin));
      },
    }),
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '80kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'Kenya Sports Predictor API',
      version: process.env.npm_package_version || '1.0.0',
      generatedAt: new Date().toISOString(),
    });
  });

  app.use('/api/auth', createRateLimiter({ windowMs: 60_000, max: 30 }), authRoutes);
  app.use('/api/user', createRateLimiter({ windowMs: 60_000, max: 80 }), userRoutes);
  app.use('/api/analytics', createRateLimiter({ windowMs: 60_000, max: 80 }), analyticsRoutes);
  app.use('/api/predict', createRateLimiter({ windowMs: 60_000, max: 20, message: 'Too many prediction requests. Please slow down.' }));
  app.use('/api/predict', predictRoutes);
  app.use('/api/predictions', createRateLimiter({ windowMs: 60_000, max: 12, message: 'Too many today research requests. Please slow down.' }));
  app.use('/api/predictions', todayPredictionRoutes);
  app.use('/api/fixtures', fixtureRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/sources', sourceRoutes);

  app.use((req, _res, next) => {
    const error = new Error(`Route not found: ${req.method} ${req.path}`);
    error.status = 404;
    next(error);
  });

  app.use((err, req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    const logPayload = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status,
      error: err,
    };

    if (status >= 500) {
      logger.error('request_failed', logPayload);
    } else {
      logger.warn('request_rejected', logPayload);
    }
    res.status(status).json({
      error: status < 500 ? err.message : 'Unexpected server error',
      details: err.details,
      requestId: req.id,
    });
  });

  return app;
};

export const app = createApp();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    logger.info('api_started', { url: `http://127.0.0.1:${PORT}` });
  });
}
