import { Router } from 'express';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { getAnalyticsSummary, trackAnalyticsEvent } from '../services/analytics/index.js';

const router = Router();

router.post('/events', async (req, res, next) => {
  try {
    const { eventName, sessionId, payload } = req.body || {};

    if (!eventName || typeof eventName !== 'string') {
      throw httpError(400, 'eventName is required.');
    }

    const result = await trackAnalyticsEvent({
      eventName,
      sessionId,
      payload,
      request: req,
    });

    res.status(202).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', requireAdminToken, async (_req, res, next) => {
  try {
    res.json(await getAnalyticsSummary());
  } catch (error) {
    next(error);
  }
});

export default router;
