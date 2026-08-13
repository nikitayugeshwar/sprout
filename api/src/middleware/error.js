import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

/**
 * Application error carrying an HTTP status and a stable machine-readable code,
 * so clients can branch on `code` instead of string-matching messages.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have access to this resource') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'not_found', msg);
export const conflict = (msg, details) => new AppError(409, 'conflict', msg, details);

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'not_found', `No route matches ${req.method} ${req.originalUrl}`));
}

/* eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity */
export function errorHandler(err, req, res, _next) {
  // Zod validation failures become a structured 422 listing every bad field at
  // once, rather than making the client fix them one round-trip at a time.
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'validation_failed',
        message: 'Some fields need attention',
        details: err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
      },
    });
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    return res.status(409).json({ error: { code: 'conflict', message: `That ${field} is already in use` } });
  }

  if (err?.name === 'CastError') {
    return res.status(400).json({ error: { code: 'bad_request', message: `"${err.value}" is not a valid ${err.kind.toLowerCase()}` } });
  }

  const status = err.status ?? 500;

  if (status >= 500) {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'unhandled error');
  }

  res.status(status).json({
    error: {
      code: err.code ?? 'internal_error',
      // Never leak an internal message to the client in production.
      message: status >= 500 && config.isProd ? 'Something went wrong on our side' : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
