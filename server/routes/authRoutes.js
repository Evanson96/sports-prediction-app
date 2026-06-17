import { Router } from 'express';
import { createSession, createUser, verifyUser } from '../services/database/index.js';
import { httpError } from '../utils/httpError.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const validateCredentials = ({ email, password }) => {
  const errors = {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    errors.email = 'Use a valid email address';
  }

  if (cleanPassword.length < 8) {
    errors.password = 'Use at least 8 characters';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { email: cleanEmail, password: cleanPassword },
  };
};

const createAuthResponse = async (user) => {
  const session = await createSession(user.id);
  return {
    user,
    token: session.token,
    expiresAt: session.expiresAt,
  };
};

router.post('/register', async (req, res, next) => {
  try {
    const validation = validateCredentials(req.body || {});

    if (!validation.isValid) {
      throw httpError(400, 'Please fix the highlighted account details.', validation.errors);
    }

    try {
      const user = await createUser(validation.value);
      res.status(201).json(await createAuthResponse(user));
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        throw httpError(409, 'An account already exists for that email.', { email: 'Already registered' });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const validation = validateCredentials(req.body || {});

    if (!validation.isValid) {
      throw httpError(400, 'Please fix the highlighted account details.', validation.errors);
    }

    const user = await verifyUser(validation.value);

    if (!user) {
      throw httpError(401, 'Invalid email or password.');
    }

    res.json(await createAuthResponse(user));
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
