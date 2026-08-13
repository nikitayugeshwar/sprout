import { z } from 'zod';

/**
 * Validates and *replaces* the request payload with the parsed result, so
 * handlers receive coerced, trimmed, known-shaped data and never touch raw
 * input. Express 5 makes `req.query` a getter, hence the separate holder.
 */
export function validate({ body, params, query }) {
  return (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body ?? {});
      if (params) req.params = params.parse(req.params ?? {});
      if (query) req.valid = { ...(req.valid ?? {}), query: query.parse(req.query ?? {}) };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

/**
 * ISO date or `YYYY-MM-DD`, rejected if it is in the future.
 *
 * A single superRefine rather than two chained refines: chained refines both
 * run, so "nonsense" would come back as *both* "must be a valid date" and
 * "cannot be in the future", which reads like the form is broken.
 *
 * The day of slack absorbs the client being in a timezone ahead of the server.
 */
export const pastDate = z
  .union([z.string(), z.date()])
  .transform((v) => new Date(v))
  .superRefine((d, ctx) => {
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'must be a valid date' });
      return;
    }
    if (d > new Date(Date.now() + 86_400_000)) {
      ctx.addIssue({ code: 'custom', message: 'cannot be in the future' });
    }
  });

export const email = z.string().trim().toLowerCase().email('must be a valid email address');
export const password = z.string().min(8, 'must be at least 8 characters').max(200);
