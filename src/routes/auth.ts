import type { FastifyInstance } from 'fastify';
import { renderPage } from '../views.js';
import { ensureCsrfToken, verifyCsrf } from '../http/csrf.js';
import { clearSession, isAuthed, setSession } from '../http/session.js';
import {
  checkAdminPassword,
  isAdminConfigured,
  setAdminPassword,
} from '../services/auth.js';

interface CredsBody {
  password?: string;
  confirm?: string;
  _csrf?: string;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // First-run: create the admin password.
  app.get('/setup', async (req, reply) => {
    if (await isAdminConfigured()) return reply.redirect('/');
    const csrf = ensureCsrfToken(req, reply);
    return reply.type('text/html').send(renderPage('setup', { csrf, error: null }));
  });

  app.post<{ Body: CredsBody }>('/setup', async (req, reply) => {
    if (await isAdminConfigured()) return reply.redirect('/');
    const csrf = ensureCsrfToken(req, reply);
    const { password, confirm } = req.body ?? {};
    const fail = (error: string) =>
      reply.type('text/html').send(renderPage('setup', { csrf, error }));

    if (!verifyCsrf(req, req.body?._csrf)) return fail('Invalid session, please retry.');
    if (!password || password.length < 8) return fail('Password must be at least 8 characters.');
    if (password !== confirm) return fail('Passwords do not match.');

    await setAdminPassword(password);
    setSession(reply);
    return reply.redirect('/');
  });

  // Login.
  app.get('/login', async (req, reply) => {
    if (!(await isAdminConfigured())) return reply.redirect('/setup');
    if (isAuthed(req)) return reply.redirect('/');
    const csrf = ensureCsrfToken(req, reply);
    return reply.type('text/html').send(renderPage('login', { csrf, error: null }));
  });

  app.post<{ Body: CredsBody }>('/login', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    const fail = (error: string) =>
      reply.type('text/html').send(renderPage('login', { csrf, error }));

    if (!verifyCsrf(req, req.body?._csrf)) return fail('Invalid session, please retry.');
    const ok = await checkAdminPassword(req.body?.password ?? '');
    if (!ok) return fail('Incorrect password.');

    setSession(reply);
    return reply.redirect('/');
  });

  app.post('/logout', async (_req, reply) => {
    clearSession(reply);
    return reply.redirect('/login');
  });
}
