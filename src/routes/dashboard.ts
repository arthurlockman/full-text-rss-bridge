import type { FastifyInstance } from 'fastify';
import { listFeeds } from '../repositories/feeds.js';
import { listSites } from '../repositories/sites.js';
import { getActiveCapture } from '../services/capture.js';
import { renderPage } from '../views.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/', async (_req, reply) => {
    const [sites, feeds] = await Promise.all([listSites(), listFeeds()]);
    const enabled = feeds.filter((f) => f.enabled).length;
    const withErrors = feeds.filter((f) => f.lastError).length;
    return reply.type('text/html').send(
      renderPage('dashboard', {
        title: 'Dashboard',
        sites,
        feeds,
        enabled,
        withErrors,
        activeCapture: getActiveCapture(),
      }),
    );
  });
}
