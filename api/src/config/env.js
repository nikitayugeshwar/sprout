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

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  aiEnabled: Boolean(parsed.data.ANTHROPIC_API_KEY),
};

if (config.isProd) {
  if (!config.MONGODB_URI) {
    console.error('MONGODB_URI is required in production — refusing to start on an ephemeral in-memory database.');
    process.exit(1);
  }
  if (config.JWT_SECRET.startsWith('sprout-dev-secret')) {
    console.error('JWT_SECRET is still the development default — refusing to start.');
    process.exit(1);
  }
}
