import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { ensureCsrfToken } from '../http/csrf.js';
import { renderPage } from '../views.js';

/** Static help/usage page mirroring the README's usage guide. */
export function registerHelpRoutes(app: FastifyInstance): void {
  app.get('/help', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    return reply
      .type('text/html')
      .send(renderPage('help', { title: 'Help', csrf, baseUrl: config.PUBLIC_BASE_URL }));
  });
}
