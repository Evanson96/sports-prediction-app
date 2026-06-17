import { Router } from 'express';
import { getSourceStatus } from '../services/sourceStatus.js';

const router = Router();

router.get('/status', async (_req, res) => {
  res.json(await getSourceStatus());
});

export default router;
