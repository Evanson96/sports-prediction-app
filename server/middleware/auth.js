import { findUserByToken } from '../services/database/index.js';
import { httpError } from '../utils/httpError.js';

export const requireAuth = async (req, _res, next) => {
  try {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!token) {
      throw httpError(401, 'Login required.');
    }

    const user = await findUserByToken(token);

    if (!user) {
      throw httpError(401, 'Session expired. Please log in again.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
