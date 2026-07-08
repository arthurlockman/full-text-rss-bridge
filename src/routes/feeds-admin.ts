import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { listFeedArticles } from '../repositories/articles.js';
import {
  createFeed,
  deleteFeed,
  getFeed,
  listFeeds,
  rotateToken,
  updateFeed,
} from '../repositories/feeds.js';
import { listSites } from '../repositories/sites.js';
import { recentRuns } from '../repositories/runs.js';
import { triggerRefresh } from '../services/scheduler.js';
import { ensureCsrfToken, verifyCsrf } from '../http/csrf.js';
import { renderPage } from '../views.js';

interface FeedBody {
  name?: string;
  sourceUrl?: string;
  siteId?: string;
  extractionMode?: string;
  selectorConfig?: string;
  outputFormat?: string;
  refreshIntervalMinutes?: string;
  maxItems?: string;
  enabled?: string;
  _csrf?: string;
}

function toFeedFields(body: FeedBody) {
  const selectorConfig = body.selectorConfig?.trim() ? body.selectorConfig.trim() : null;
  if (selectorConfig) JSON.parse(selectorConfig); // throws on invalid JSON
  return {
    name: body.name?.trim() ?? '',
    sourceUrl: body.sourceUrl?.trim() ?? '',
    siteId: body.siteId && body.siteId !== '' ? body.siteId : null,
    extractionMode: body.extractionMode === 'selector' ? 'selector' : 'readability',
    selectorConfig,
    outputFormat: ['rss', 'atom', 'json'].includes(body.outputFormat ?? '')
      ? (body.outputFormat as string)
      : 'rss',
    refreshIntervalMinutes: Math.max(5, Number(body.refreshIntervalMinutes) || 60),
    maxItems: Math.max(1, Math.min(200, Number(body.maxItems) || 50)),
    enabled: body.enabled === 'on' || body.enabled === 'true',
  };
}

export function registerFeedAdminRoutes(app: FastifyInstance): void {
  app.get('/feeds', async (req, reply) => {
    const feeds = await listFeeds();
    const csrf = ensureCsrfToken(req, reply);
    return reply.type('text/html').send(
      renderPage('feeds/list', {
        title: 'Feeds',
        feeds,
        csrf,
        baseUrl: config.PUBLIC_BASE_URL,
        query: req.query,
      }),
    );
  });

  app.get('/feeds/new', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    const sites = await listSites();
    return reply
      .type('text/html')
      .send(renderPage('feeds/form', { title: 'New feed', csrf, feed: null, sites, error: null }));
  });

  app.post<{ Body: FeedBody }>('/feeds', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    const sites = await listSites();
    const body = req.body ?? {};
    const fail = (error: string) =>
      reply
        .type('text/html')
        .send(renderPage('feeds/form', { title: 'New feed', csrf, feed: body, sites, error }));

    if (!verifyCsrf(req, body._csrf)) return fail('Invalid session, retry.');
    let fields;
    try {
      fields = toFeedFields(body);
    } catch {
      return fail('Selector config must be valid JSON.');
    }
    if (!fields.name || !fields.sourceUrl) return fail('Name and source URL are required.');

    const feed = await createFeed(fields);
    return reply.redirect(`/feeds?msg=Created+${encodeURIComponent(feed.name)}`);
  });

  app.get<{ Params: { id: string } }>('/feeds/:id/edit', async (req, reply) => {
    const feed = await getFeed(req.params.id);
    if (!feed) return reply.redirect('/feeds?err=Not+found');
    const csrf = ensureCsrfToken(req, reply);
    const sites = await listSites();
    return reply
      .type('text/html')
      .send(renderPage('feeds/form', { title: 'Edit feed', csrf, feed, sites, error: null }));
  });

  app.post<{ Params: { id: string }; Body: FeedBody }>('/feeds/:id', async (req, reply) => {
    const feed = await getFeed(req.params.id);
    if (!feed) return reply.redirect('/feeds?err=Not+found');
    const csrf = ensureCsrfToken(req, reply);
    const sites = await listSites();
    const body = req.body ?? {};
    if (!verifyCsrf(req, body._csrf)) return reply.redirect(`/feeds/${feed.id}/edit?err=Retry`);
    try {
      const fields = toFeedFields(body);
      if (!fields.name || !fields.sourceUrl) throw new Error('missing');
      await updateFeed(feed.id, fields);
    } catch {
      return reply
        .type('text/html')
        .send(
          renderPage('feeds/form', {
            title: 'Edit feed',
            csrf,
            feed: { ...feed, ...body },
            sites,
            error: 'Check required fields and JSON.',
          }),
        );
    }
    return reply.redirect('/feeds?msg=Saved');
  });

  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/feeds/:id/delete',
    async (req, reply) => {
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect('/feeds?err=Retry');
      await deleteFeed(req.params.id);
      return reply.redirect('/feeds?msg=Deleted');
    },
  );

  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/feeds/:id/refresh',
    async (req, reply) => {
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect('/feeds?err=Retry');
      const ok = await triggerRefresh(req.params.id);
      return reply.redirect(`/feeds?msg=${ok ? 'Refresh+queued' : 'Already+running'}`);
    },
  );

  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/feeds/:id/rotate-token',
    async (req, reply) => {
      if (!verifyCsrf(req, req.body?._csrf)) return reply.redirect('/feeds?err=Retry');
      await rotateToken(req.params.id);
      return reply.redirect('/feeds?msg=Token+rotated');
    },
  );

  app.get<{ Params: { id: string } }>('/feeds/:id/articles', async (req, reply) => {
    const feed = await getFeed(req.params.id);
    if (!feed) return reply.redirect('/feeds?err=Not+found');
    const [articles, runs] = await Promise.all([
      listFeedArticles(feed.id, 100),
      recentRuns(feed.id, 10),
    ]);
    return reply
      .type('text/html')
      .send(renderPage('feeds/articles', { title: feed.name, feed, articles, runs }));
  });
}
