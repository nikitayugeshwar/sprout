import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuration is validated once at boot. A missing JWT secret in production
 * should stop the process, not surface as a confusing 500 on the first login.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** Omit in development and an in-memory MongoDB is started automatically. */
  MONGODB_URI: z.string().optional(),

  /**
   * Forces the in-memory database even when MONGODB_URI is set — useful for
   * carrying on locally while a remote cluster is down.
   *
   * This exists as its own flag rather than "just blank out MONGODB_URI"
   * because Windows deletes an environment variable assigned an empty string,
   * so dotenv immediately refills it from .env and the override silently does
   * nothing.
   */
  USE_IN_MEMORY_DB: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  JWT_SECRET: z.string().min(16).default('sprout-dev-secret-change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  /** Comma-separated list, or "*" to reflect any origin. */
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DEMO_EMAIL: z.string().email().default('demo@sprout.health'),
  DEMO_PASSWORD: z.string().min(6).default('sproutdemo'),

  /** Optional — enables the grounded AI answer endpoint when present. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

/**
 * True inside a serverless container (Vercel, Lambda).
 *
 * This matters because the two runtimes fail differently. A standalone server
 * should die loudly on bad configuration — the operator reads the message and
 * fixes it. A serverless function must NOT: `process.exit()` during module
 * evaluation is reported as a bare FUNCTION_INVOCATION_FAILED / 500, with the
 * reason buried in the platform logs and nothing useful sent to the caller.
 * So there we record the problem and let the request handler report it.
 */
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const parsed = schema.safeParse(process.env);

/** Configuration problems fatal enough that the app cannot serve traffic. */
const fatal = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

// Fall back to the schema's defaults when parsing failed, so the module can
// finish loading and the handler can report `configErrors` properly.
const data = parsed.success ? parsed.data : schema.parse({});

export const config = {
  ...data,
  isProd: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  isServerless: IS_SERVERLESS,
  corsOrigins: data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  aiEnabled: Boolean(data.ANTHROPIC_API_KEY),
};

if (config.isProd) {
  if (config.USE_IN_MEMORY_DB) {
    fatal.push('USE_IN_MEMORY_DB is a development-only escape hatch and cannot be used in production.');
  }
  if (!config.MONGODB_URI) {
    fatal.push('MONGODB_URI is not set. Add your MongoDB connection string to the environment variables.');
  }
  if (config.JWT_SECRET.startsWith('sprout-dev-secret')) {
    fatal.push(
      'JWT_SECRET is still the development default. Generate one with:\n' +
        '      node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
}

/** Read by the serverless handler to turn misconfiguration into a readable 503. */
export const configErrors = fatal;

if (fatal.length) {
  console.error('Invalid configuration:');
  for (const f of fatal) console.error(`  • ${f}`);
  if (!IS_SERVERLESS) process.exit(1);
}
