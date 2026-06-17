import { Router } from 'express';
import { deletePrediction, listPredictions, savePrediction } from '../services/database/index.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';

const router = Router();

router.use(requireAuth);

router.get('/history', async (req, res, next) => {
  try {
    res.json({ history: await listPredictions(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/history', async (req, res, next) => {
  try {
    const prediction = req.body?.prediction;

    if (!prediction?.match || !prediction?.mainPrediction) {
      throw httpError(400, 'A complete prediction payload is required.');
    }

    const result = await savePrediction({ userId: req.user.id, prediction });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.delete('/history/:id', async (req, res, next) => {
  try {
    const result = await deletePrediction({ userId: req.user.id, id: req.params.id });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
