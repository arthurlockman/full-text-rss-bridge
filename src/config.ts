import { z } from 'zod';

/**
 * Central, validated application configuration sourced from environment
 * variables. Import `config` anywhere instead of reading `process.env`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATA_DIR: z.string().default('./data'),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_ENCRYPTION_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  DISPLAY: z.string().default(':99'),
  VNC_PORT: z.coerce.number().int().positive().default(5900),
  NOVNC_PORT: z.coerce.number().int().positive().default(6080),
  /** Full URL of the noVNC client used to view the interactive capture browser. */
  NOVNC_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type AppConfig = z.infer<typeof envSchema> & {
  dbPath: string;
  sessionsDir: string;
  cookieSecure: boolean;
};

function load(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;
  return {
    ...env,
    dbPath: `${env.DATA_DIR.replace(/\/$/, '')}/app.db`,
    sessionsDir: `${env.DATA_DIR.replace(/\/$/, '')}/sessions`,
    // Mark cookies Secure only when the app is reached over HTTPS (per
    // PUBLIC_BASE_URL). This keeps login working when self-hosting directly
    // over http:// on a LAN, while enabling Secure cookies behind TLS.
    cookieSecure: env.PUBLIC_BASE_URL.startsWith('https://'),
  };
}

export const config = load();
