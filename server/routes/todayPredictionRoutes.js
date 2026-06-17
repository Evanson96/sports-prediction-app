import { Router } from 'express';
import { getTodayPredictionSlips } from '../services/todayPredictions/index.js';
import { httpError } from '../utils/httpError.js';

const router = Router();

const localDate = () => new Date().toISOString().slice(0, 10);

const normalizeSport = (sport) => {
  const value = String(sport || 'Football').trim();
  if (!value || value.toLowerCase() === 'football') return 'Football';
  if (value.toLowerCase() === 'all') return 'All';
  return value;
};

router.get('/today', async (req, res, next) => {
  try {
    const date = String(req.query.date || localDate()).trim();
    const sport = normalizeSport(req.query.sport);
    const limit = req.query.limit;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      throw httpError(400, 'Use a valid prediction date.', { date: 'Use YYYY-MM-DD' });
    }

    res.json(await getTodayPredictionSlips({ date, sport, limit }));
  } catch (error) {
    next(error);
  }
});

export default router;
