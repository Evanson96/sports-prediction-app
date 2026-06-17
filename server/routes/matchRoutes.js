import { Router } from 'express';
import {
  getCountries,
  getMatchesByCountryAndSport,
  getMatchesByCountrySportAndDate,
  getMatchProvider,
  getSportsByCountry,
} from '../services/matchService.js';
import { httpError } from '../utils/httpError.js';

const router = Router();

router.get('/countries', async (_req, res, next) => {
  try {
    res.json({ provider: getMatchProvider(), countries: await getCountries() });
  } catch (error) {
    next(error);
  }
});

router.get('/sports', async (req, res, next) => {
  try {
    const country = String(req.query.country || '').trim();

    if (!country) {
      throw httpError(400, 'Country is required.', { country: 'Required' });
    }

    res.json({ provider: getMatchProvider(), country, sports: await getSportsByCountry(country) });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const country = String(req.query.country || '').trim();
    const sport = String(req.query.sport || '').trim();
    const date = String(req.query.date || '').trim();

    if (!country || !sport) {
      throw httpError(400, 'Country and sport are required.', {
        country: country ? undefined : 'Required',
        sport: sport ? undefined : 'Required',
      });
    }

    if (date && Number.isNaN(Date.parse(date))) {
      throw httpError(400, 'Use a valid match date.', { date: 'Use a valid date' });
    }

    res.json({
      provider: getMatchProvider(),
      country,
      sport,
      date: date || null,
      matches: date
        ? await getMatchesByCountrySportAndDate(country, sport, date)
        : await getMatchesByCountryAndSport(country, sport),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
