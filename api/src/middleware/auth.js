import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User, Child } from '../models/index.js';
import { unauthorized, notFound, forbidden } from './error.js';

const COOKIE = 'sprout_token';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
}

/**
 * Sets the session cookie for same-origin deployments. The token is also
 * returned in the response body because the reference deployment runs the web
 * app and the API on different origins, where a third-party cookie is not a
 * bet worth making.
 */
export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/', secure: config.isProd, sameSite: config.isProd ? 'none' : 'lax' });
}

function extractToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[COOKIE] ?? null;
}

export async function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    return next(unauthorized(err.name === 'TokenExpiredError' ? 'Your session has expired' : 'Invalid session'));
  }

  const user = await User.findById(payload.sub);
  if (!user) return next(unauthorized('Account no longer exists'));

  req.user = user;
  next();
}

/**
 * Loads `req.params.childId` and asserts the signed-in user owns it.
 *
 * Ownership is checked here rather than in each handler so that no future route
 * can forget to do it — the child is simply not available unless it is yours.
 */
export async function loadChild(req, _res, next) {
  const child = await Child.findById(req.params.childId);
  if (!child) return next(notFound('No such child'));
  if (child.userId.toString() !== req.user.id) return next(forbidden());

  req.child = child;
  next();
}
