import { Router } from 'express';
import { getTodayFixtures } from '../services/sportsStats/index.js';
import { httpError } from '../utils/httpError.js';

const router = Router();

const localDate = () => new Date().toISOString().slice(0, 10);

router.get('/today', async (req, res, next) => {
  try {
    const date = String(req.query.date || localDate()).trim();

    if (Number.isNaN(Date.parse(date))) {
      throw httpError(400, 'Use a valid fixture date.', { date: 'Use a valid date' });
    }

    res.json(await getTodayFixtures({ date }));
  } catch (error) {
    next(error);
  }
});

export default router;
