import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
import { config } from './config.js';
import { loggerOptions } from './logger.js';
import { publicDir } from './views.js';
import { isAuthed } from './http/session.js';
import { isAdminConfigured, SESSION_COOKIE, SESSION_VALUE } from './services/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerFeedAdminRoutes } from './routes/feeds-admin.js';
import { registerFeedRoutes } from './routes/feeds-public.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerHelpRoutes } from './routes/help.js';
import { registerSiteRoutes } from './routes/sites.js';
import { registerSettingsRoutes } from './routes/settings.js';

/** Paths served without authentication. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/public/') ||
    pathname === '/health' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/feed/')
  );
}

/**
 * Validates the signed admin session cookie from a raw Cookie header. Used to
 * gate the noVNC WebSocket upgrade, which bypasses the normal request lifecycle.
 */
function isSessionCookieValid(app: FastifyInstance, cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  const entry = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return false;
  const raw = decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1));
  const result = app.unsignCookie(raw);
  return result.valid && result.value === SESSION_VALUE;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions, trustProxy: true });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(formbody);
  await app.register(fastifyStatic, { root: publicDir, prefix: '/public/' });

  // Auth guard: first-run setup redirect, then require a valid session.
  app.addHook('preHandler', async (req, reply) => {
    const pathname = req.url.split('?')[0] ?? '/';
    if (isPublicPath(pathname)) return;

    const isSetupPath = pathname === '/setup' || pathname.startsWith('/setup/');
    const isLoginPath = pathname === '/login' || pathname.startsWith('/login/');

    const configured = await isAdminConfigured();
    if (!configured) {
      // Before any passkey exists, only the setup flow is reachable.
      if (!isSetupPath) return reply.redirect('/setup');
      return;
    }
    if (isSetupPath) return reply.redirect('/');
    if (isLoginPath) return; // login page + passkey endpoints handled by routes
    if (!isAuthed(req)) return reply.redirect('/login');
  });

  // Reverse-proxy the internal noVNC endpoint (websockify) under /novnc so the
  // interactive capture browser is reachable same-origin through the app —
  // only port 8080 needs exposing. The HTTP client is gated by the auth guard
  // above; the WebSocket upgrade (which bypasses hooks) is gated by verifyClient.
  await app.register(fastifyHttpProxy, {
    upstream: `http://127.0.0.1:${config.NOVNC_PORT}`,
    prefix: '/novnc',
    rewritePrefix: '',
    websocket: true,
    wsServerOptions: {
      verifyClient: (
        info: { req: { headers: { cookie?: string } } },
        next: (verified: boolean, code?: number, message?: string) => void,
      ) => {
        if (isSessionCookieValid(app, info.req.headers.cookie)) next(true);
        else next(false, 401, 'Unauthorized');
      },
    },
  });

  registerHealthRoutes(app);
  registerFeedRoutes(app);
  registerAuthRoutes(app);
  registerDashboardRoutes(app);
  registerSiteRoutes(app);
  registerFeedAdminRoutes(app);
  registerSettingsRoutes(app);
  registerHelpRoutes(app);

  return app;
}
