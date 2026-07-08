import { describe, it, expect } from 'vitest';
import { generateFeed, parseFormat } from '../src/services/feed-generator.js';
import type { Article, Feed } from '../src/db/schema.js';

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  const now = new Date('2024-01-01T00:00:00Z');
  return {
    id: 'feed_1',
    name: 'Defector Full Text',
    sourceUrl: 'https://defector.com/rss',
    siteId: 'site_1',
    extractionMode: 'readability',
    selectorConfig: null,
    outputFormat: 'rss',
    accessToken: 'tok_secret',
    refreshIntervalMinutes: 60,
    maxItems: 50,
    enabled: true,
    lastRefreshedAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeArticle(overrides: Partial<Article> = {}): Article {
  const now = new Date('2024-02-02T12:00:00Z');
  return {
    id: 'art_1',
    feedId: 'feed_1',
    guid: 'https://defector.com/posts/1',
    url: 'https://defector.com/posts/1',
    title: 'A Full Text Article',
    author: 'A Writer',
    summary: 'short summary',
    contentHtml: '<p>The complete body of the article lives here.</p>',
    contentHash: 'hash1',
    extractionStatus: 'ok',
    extractionError: null,
    publishedAt: now,
    fetchedAt: now,
    createdAt: now,
    ...overrides,
  };
}

describe('parseFormat', () => {
  it('accepts valid formats and falls back otherwise', () => {
    expect(parseFormat('atom', 'rss')).toBe('atom');
    expect(parseFormat('json', 'rss')).toBe('json');
    expect(parseFormat(undefined, 'atom')).toBe('atom');
    expect(parseFormat('bogus', 'rss')).toBe('rss');
  });
});

describe('generateFeed', () => {
  const feed = makeFeed();
  const articles = [makeArticle()];

  it('builds RSS with full content and correct content-type', () => {
    const out = generateFeed(feed, articles, 'rss');
    expect(out.contentType).toContain('application/rss+xml');
    expect(out.body).toContain('<rss');
    expect(out.body).toContain('A Full Text Article');
    expect(out.body).toContain('The complete body of the article lives here.');
  });

  it('builds Atom output', () => {
    const out = generateFeed(feed, articles, 'atom');
    expect(out.contentType).toContain('application/atom+xml');
    expect(out.body).toContain('<feed');
    expect(out.body).toContain('A Full Text Article');
  });

  it('builds JSON Feed output', () => {
    const out = generateFeed(feed, articles, 'json');
    expect(out.contentType).toContain('application/feed+json');
    const parsed = JSON.parse(out.body);
    expect(parsed.version).toContain('jsonfeed.org');
    expect(parsed.items[0].title).toBe('A Full Text Article');
    expect(parsed.items[0].content_html).toContain('complete body');
  });

  it('handles an empty article list without throwing', () => {
    const out = generateFeed(feed, [], 'rss');
    expect(out.body).toContain('<rss');
  });

  it('uses a fallback title for untitled articles', () => {
    const out = generateFeed(feed, [makeArticle({ title: null })], 'json');
    const parsed = JSON.parse(out.body);
    expect(parsed.items[0].title).toBe('(untitled)');
  });

  it('links the feed to an explicit source homepage for favicon discovery', () => {
    const out = generateFeed(feed, articles, 'json', {
      homepageUrl: 'https://defector.com',
    });
    const parsed = JSON.parse(out.body);
    expect(parsed.home_page_url).toBe('https://defector.com');
  });

  it('sets the RSS channel link to the source homepage', () => {
    const out = generateFeed(feed, articles, 'rss', {
      homepageUrl: 'https://defector.com',
    });
    expect(out.body).toContain('<link>https://defector.com</link>');
  });

  it('exposes the source favicon in the Atom feed icon', () => {
    const out = generateFeed(feed, articles, 'atom', {
      homepageUrl: 'https://defector.com',
    });
    expect(out.body).toContain('<icon>https://defector.com/favicon.ico</icon>');
  });

  it('falls back to the first article origin when no homepage is given', () => {
    const out = generateFeed(feed, [makeArticle({ url: 'https://petapixel.com/a/1' })], 'json');
    const parsed = JSON.parse(out.body);
    expect(parsed.home_page_url).toBe('https://petapixel.com');
  });

  it('omits the guessed favicon when no source homepage can be resolved', () => {
    const out = generateFeed(feed, [], 'atom');
    expect(out.body).not.toContain('<icon>');
  });
});
