import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { createSite, deleteSite, getSite, updateSite } from '../repositories/sites.js';
import {
  cancelCapture,
  getActiveCapture,
  saveCapture,
  startCapture,
} from '../services/capture.js';
import { validateSite } from '../services/validation.js';
import { parseImportedSession } from '../util/cookies.js';
import { ensureCsrfToken, verifyCsrf } from '../http/csrf.js';
import { persistStorageState } from '../services/site-session.js';
import { renderPage } from '../views.js';
import { listSites } from '../repositories/sites.js';

interface SiteBody {
  name?: string;
  domain?: string;
  loginUrl?: string;
  validationUrl?: string;
  loggedInSelector?: string;
  notes?: string;
  _csrf?: string;
}

export function registerSiteRoutes(app: FastifyInstance): void {
  app.get('/sites', async (req, reply) => {
    const sites = await listSites();
    const csrf = ensureCsrfToken(req, reply);
    return reply
      .type('text/html')
      .send(renderPage('sites/list', { title: 'Sites', sites, csrf, query: req.query }));
  });

  app.get('/sites/new', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    return reply
      .type('text/html')
      .send(renderPage('sites/form', { title: 'New site', csrf, site: null, error: null }));
  });

  app.post<{ Body: SiteBody }>('/sites', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    const body = req.body ?? {};
    if (!verifyCsrf(req, body._csrf)) {
      return reply
        .type('text/html')
        .send(renderPage('sites/form', { title: 'New site', csrf, site: body, error: 'Invalid session, retry.' }));
    }
    if (!body.name || !body.domain) {
      return reply
        .type('text/html')
        .send(renderPage('sites/form', { title: 'New site', csrf, site: body, error: 'Name and domain are required.' }));
    }
    const site = await createSite({
      name: body.name,
      domain: body.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      loginUrl: body.loginUrl || null,
      validationUrl: body.validationUrl || null,
      loggedInSelector: body.loggedInSelector || null,
      notes: body.notes || null,
    });
    return reply.redirect(`/sites?msg=Created+${encodeURIComponent(site.name)}`);
  });

  app.get<{ Params: { id: string } }>('/sites/:id/edit', async (req, reply) => {
    const site = await getSite(req.params.id);
    if (!site) return reply.redirect('/sites?err=Not+found');
    const csrf = ensureCsrfToken(req, reply);
    return reply
      .type('text/html')
      .send(renderPage('sites/form', { title: 'Edit site', csrf, site, error: null }));
  });

  app.post<{ Params: { id: string }; Body: SiteBody }>('/sites/:id', async (req, reply) => {
    const site = await getSite(req.params.id);
    if (!site) return reply.redirect('/sites?err=Not+found');
    const body = req.body ?? {};
    if (!verifyCsrf(req, body._csrf)) return reply.redirect(`/sites/${site.id}/edit?err=Retry`);
    await updateSite(site.id, {
      name: body.name || site.name,
      domain: (body.domain || site.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      loginUrl: body.loginUrl || null,
      validationUrl: body.validationUrl || null,
      loggedInSelector: body.loggedInSelector || null,
      notes: body.notes || null,
    });
    return reply.redirect('/sites?msg=Saved');
  });

  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/sites/:id/delete',
    async (req, reply) => {
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect('/sites?err=Retry');
      await deleteSite(req.params.id);
      return reply.redirect('/sites?msg=Deleted');
    },
  );

  // --- Interactive capture ---
  app.get<{ Params: { id: string } }>('/sites/:id/capture', async (req, reply) => {
    const site = await getSite(req.params.id);
    if (!site) return reply.redirect('/sites?err=Not+found');
    const csrf = ensureCsrfToken(req, reply);
    return reply.type('text/html').send(
      renderPage('sites/capture', {
        title: `Capture · ${site.name}`,
        csrf,
        site,
        active: getActiveCapture(),
        novncUrl: config.NOVNC_URL ?? null,
        error: req.query && (req.query as { err?: string }).err,
      }),
    );
  });

  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/sites/:id/capture/start',
    async (req, reply) => {
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect(`/sites/${req.params.id}/capture?err=Retry`);
      try {
        await startCapture(req.params.id);
        return reply.redirect(`/sites/${req.params.id}/capture`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to start';
        return reply.redirect(`/sites/${req.params.id}/capture?err=${encodeURIComponent(msg)}`);
      }
    },
  );

  app.post<{ Params: { capId: string }; Body: { _csrf?: string; siteId?: string } }>(
    '/capture/:capId/save',
    async (req, reply) => {
      const siteId = req.body?.siteId ?? '';
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect(`/sites/${siteId}/capture?err=Retry`);
      try {
        await saveCapture(req.params.capId);
        return reply.redirect('/sites?msg=Session+captured');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save';
        return reply.redirect(`/sites/${siteId}/capture?err=${encodeURIComponent(msg)}`);
      }
    },
  );

  app.post<{ Params: { capId: string }; Body: { _csrf?: string; siteId?: string } }>(
    '/capture/:capId/cancel',
    async (req, reply) => {
      const siteId = req.body?.siteId ?? '';
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect(`/sites/${siteId}/capture?err=Retry`);
      await cancelCapture(req.params.capId);
      return reply.redirect(`/sites/${siteId}/capture`);
    },
  );

  // --- Cookie/session import ---
  app.post<{ Params: { id: string }; Body: { _csrf?: string; session?: string } }>(
    '/sites/:id/import',
    async (req, reply) => {
      const site = await getSite(req.params.id);
      if (!site) return reply.redirect('/sites?err=Not+found');
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect(`/sites/${site.id}/capture?err=Retry`);
      try {
        const state = parseImportedSession(req.body?.session ?? '');
        await persistStorageState(site.id, state);
        return reply.redirect('/sites?msg=Session+imported');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import failed';
        return reply.redirect(`/sites/${site.id}/capture?err=${encodeURIComponent(msg)}`);
      }
    },
  );

  // --- Session validation ---
  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/sites/:id/validate',
    async (req, reply) => {
      const site = await getSite(req.params.id);
      if (!site) return reply.redirect('/sites?err=Not+found');
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect('/sites?err=Retry');
      const status = await validateSite(site);
      return reply.redirect(`/sites?msg=Session+${status}`);
    },
  );
}
