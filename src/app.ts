import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { loggerOptions } from './logger.js';
import { publicDir } from './views.js';
import { isAuthed } from './http/session.js';
import { isAdminConfigured } from './services/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerFeedAdminRoutes } from './routes/feeds-admin.js';
import { registerFeedRoutes } from './routes/feeds-public.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSiteRoutes } from './routes/sites.js';

/** Paths served without authentication. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/public/') ||
    pathname === '/health' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/feed/')
  );
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

    const configured = await isAdminConfigured();
    if (!configured) {
      if (pathname !== '/setup') return reply.redirect('/setup');
      return;
    }
    if (pathname === '/setup') return reply.redirect('/');
    if (pathname === '/login') return; // login page + POST handled by route
    if (!isAuthed(req)) return reply.redirect('/login');
  });

  registerHealthRoutes(app);
  registerFeedRoutes(app);
  registerAuthRoutes(app);
  registerDashboardRoutes(app);
  registerSiteRoutes(app);
  registerFeedAdminRoutes(app);

  return app;
}
