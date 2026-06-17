import { Router } from 'express';
import { resolveAndBuildPredictionResponse } from '../services/predictionEngine/index.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    res.json(await resolveAndBuildPredictionResponse(req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
