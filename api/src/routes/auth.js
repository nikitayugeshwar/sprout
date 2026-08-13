import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';
import { validate, email, password } from '../middleware/validate.js';
import { unauthorized, conflict } from '../middleware/error.js';
import { seedDemoData } from '../services/demo/generate.js';
import { config } from '../config/env.js';

export const authRouter = Router();

/**
 * Credential endpoints are the ones worth brute-forcing, so they get a tighter
 * limit than the rest of the API.
 */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 20 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' } },
});

const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isProd ? 30 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Demo limit reached for this hour.' } },
});

function respondWithSession(res, user, status = 200, extra = {}) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return res.status(status).json({ token, user: user.toJSON(), ...extra });
}

authRouter.post(
  '/register',
  credentialLimiter,
  validate({
    body: z.object({
      name: z.string().trim().min(1, 'is required').max(80),
      email,
      password,
    }),
  }),
  async (req, res) => {
    const existing = await User.findOne({ email: req.body.email });
    if (existing) throw conflict('An account with that email already exists');

    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      passwordHash: await User.hashPassword(req.body.password),
    });

    return respondWithSession(res, user, 201);
  },
);

authRouter.post(
  '/login',
  credentialLimiter,
  validate({ body: z.object({ email, password: z.string().min(1, 'is required') }) }),
  async (req, res) => {
    const user = await User.findOne({ email: req.body.email });

    // Same response whether the email is unknown or the password is wrong —
    // otherwise this endpoint doubles as a "does this person have an account"
    // oracle.
    if (!user || !(await user.verifyPassword(req.body.password))) {
      throw unauthorized('Email or password is incorrect');
    }

    return respondWithSession(res, user);
  },
);

/**
 * Provisions a throwaway account pre-loaded with two children and roughly two
 * years of history, and signs the visitor straight in. Isolated per visitor, so
 * the demo is fully writable.
 */
authRouter.post('/demo', demoLimiter, async (req, res) => {
  const suffix = Math.random().toString(36).slice(2, 10);

  const user = await User.create({
    name: 'Guest',
    email: `demo+${suffix}@sprout.health`,
    passwordHash: await User.hashPassword(`${suffix}-${Date.now()}`),
    isDemo: true,
  });

  const children = await seedDemoData(user.id);

  return respondWithSession(res, user, 201, {
    demo: true,
    children: children.map((c) => ({ id: c.id, name: c.name })),
  });
});

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toJSON() });
});
