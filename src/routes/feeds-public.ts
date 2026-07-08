import type { FastifyInstance } from 'fastify';
import { getFeedArticles } from '../repositories/articles.js';
import { getFeedByToken } from '../repositories/feeds.js';
import { getSite } from '../repositories/sites.js';
import { generateFeed, parseFormat } from '../services/feed-generator.js';

/** Public, token-authenticated full-text feed endpoint. */
export function registerFeedRoutes(app: FastifyInstance): void {
  app.get<{ Params: { token: string } }>('/feed/:token', async (req, reply) => {
    const raw = req.params.token;
    const match = raw.match(/\.(rss|atom|json)$/);
    const token = match ? raw.slice(0, -match[0].length) : raw;
    const explicitFormat = match?.[1];

    const feed = await getFeedByToken(token);
    if (!feed || !feed.enabled) {
      return reply.code(404).type('text/plain').send('Feed not found');
    }

    const format = parseFormat(explicitFormat, feed.outputFormat);
    const articles = await getFeedArticles(feed.id, feed.maxItems);

    // Point the feed's website link at the source publication so readers show
    // its favicon, using the mapped site's domain when available.
    let homepageUrl: string | undefined;
    if (feed.siteId) {
      const site = await getSite(feed.siteId);
      if (site?.domain) homepageUrl = `https://${site.domain}`;
    }

    const { body, contentType } = generateFeed(feed, articles, format, { homepageUrl });

    return reply
      .header('cache-control', 'public, max-age=300')
      .type(contentType)
      .send(body);
  });
}
