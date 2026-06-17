import { httpError } from '../utils/httpError.js';

const isWeakToken = (token) =>
  !token || token === 'change-me-before-production' || token.length < 24 || token.toLowerCase().includes('change-me');

export const requireAdminToken = (req, _res, next) => {
  const expectedToken = process.env.ANALYTICS_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';

  if (isWeakToken(expectedToken)) {
    next(httpError(503, 'Admin token is not configured securely.'));
    return;
  }

  const suppliedToken = req.get('x-admin-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (suppliedToken !== expectedToken) {
    next(httpError(403, 'Admin access is restricted.'));
    return;
  }

  next();
};
