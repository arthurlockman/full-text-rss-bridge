import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Parser from 'rss-parser';
import { extractArticle } from '../src/services/extraction.js';
import { generateFeed } from '../src/services/feed-generator.js';
import type { Article, Feed } from '../src/db/schema.js';

/**
 * End-to-end pipeline test against a locally served mock publication: parse a
 * source RSS feed (rss-parser) -> fetch each article page -> extract full text
 * (Readability) -> republish as a full-text feed (feed). This mirrors the
 * production flow; only the authenticated Playwright fetch is swapped for a
 * plain fetch since the mock pages need no JS rendering.
 */

const ARTICLES: Record<string, { title: string; body: string }> = {
  '1': {
    title: 'The First Full Article',
    body: 'Uniquebodyalpha: worker owned sports writing that goes on for a while so the readability scorer is convinced this is the real article content and not navigation chrome around the edges of the page.',
  },
  '2': {
    title: 'The Second Full Article',
    body: 'Uniquebodybeta: another long and wordy article body that continues with enough sentences and substance for the extraction algorithm to confidently select it as the primary content of the document.',
  },
};

let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  app = Fastify();

  app.get('/rss', (_req, reply) => {
    const items = Object.keys(ARTICLES)
      .map(
        (id) => `
      <item>
        <title>${ARTICLES[id]!.title}</title>
        <link>${base}/article/${id}</link>
        <guid>${base}/article/${id}</guid>
        <description>Truncated teaser only...</description>
        <pubDate>Mon, 01 Jan 2024 00:00:0${id} GMT</pubDate>
      </item>`,
      )
      .join('');
    reply.type('application/rss+xml').send(
      `<?xml version="1.0"?><rss version="2.0"><channel>
        <title>Mock Publication</title>
        <link>${base}</link>
        <description>partial feed</description>
        ${items}
      </channel></rss>`,
    );
  });

  app.get('/article/:id', (req, reply) => {
    const id = (req.params as { id: string }).id;
    const a = ARTICLES[id];
    if (!a) return reply.code(404).send('nope');
    return reply.type('text/html').send(
      `<!doctype html><html><head><title>${a.title}</title></head>
        <body>
          <header><nav>home about</nav></header>
          <article>
            <h1>${a.title}</h1>
            <p>${a.body}</p>
            <p>A second supporting paragraph with additional prose to reinforce
               that this article element is the dominant text block on the page.</p>
            <p><img src="../img/${id}.png" alt="figure"></p>
          </article>
          <footer>legal</footer>
        </body></html>`,
    );
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await app.close();
});

function makeFeed(): Feed {
  const now = new Date();
  return {
    id: 'feed_mock',
    name: 'Mock Full Text',
    sourceUrl: `${base}/rss`,
    siteId: null,
    extractionMode: 'readability',
    selectorConfig: null,
    outputFormat: 'rss',
    accessToken: 'tok_mock',
    refreshIntervalMinutes: 60,
    maxItems: 50,
    enabled: true,
    lastRefreshedAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('pipeline: parse -> fetch -> extract -> generate', () => {
  it('produces a full-text feed from a partial source feed', async () => {
    const parser = new Parser();
    const source = await parser.parseURL(`${base}/rss`);
    expect(source.items).toHaveLength(2);

    const articles: Article[] = [];
    for (const item of source.items) {
      const url = item.link!;
      const html = await (await fetch(url)).text();
      const extracted = extractArticle({ html, url, mode: 'readability' });
      articles.push({
        id: `art_${item.guid}`,
        feedId: 'feed_mock',
        guid: item.guid ?? url,
        url,
        title: extracted.title ?? item.title ?? null,
        author: null,
        summary: item.contentSnippet ?? null,
        contentHtml: extracted.contentHtml,
        contentHash: null,
        extractionStatus: 'ok',
        extractionError: null,
        publishedAt: item.isoDate ? new Date(item.isoDate) : null,
        fetchedAt: new Date(),
        createdAt: new Date(),
      });
    }

    // Full body text was extracted for both articles.
    expect(articles[0]!.contentHtml).toContain('Uniquebodyalpha');
    expect(articles[1]!.contentHtml).toContain('Uniquebodybeta');
    // Relative image URL absolutized against the article URL.
    expect(articles[0]!.contentHtml).toContain(`${base}/img/1.png`);

    const out = generateFeed(makeFeed(), articles, 'rss');
    expect(out.body).toContain('Uniquebodyalpha');
    expect(out.body).toContain('Uniquebodybeta');
    expect(out.body).toContain('The First Full Article');
    expect(out.body).toContain('The Second Full Article');
  });
});
