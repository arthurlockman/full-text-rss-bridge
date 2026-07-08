import { createHash } from 'node:crypto';
import type { BrowserContext } from 'playwright';
import Parser from 'rss-parser';
import type { Feed } from '../db/schema.js';
import { logger } from '../logger.js';
import { upsertArticle, getArticleByGuid } from '../repositories/articles.js';
import { markRefreshed } from '../repositories/feeds.js';
import { finishRun, startRun } from '../repositories/runs.js';
import { getSite } from '../repositories/sites.js';
import { newContext } from './browser.js';
import { fetchRenderedHtml } from './browser.js';
import { extractArticle, type ExtractionMode, type SelectorConfig } from './extraction.js';
import { createSiteContext, hasSession } from './site-session.js';

const parser = new Parser();

export interface RefreshResult {
  itemsSeen: number;
  itemsExtracted: number;
  errors: number;
}

function parseSelectorConfig(raw: string | null): SelectorConfig | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as SelectorConfig;
  } catch {
    logger.warn('Invalid selectorConfig JSON; ignoring');
    return undefined;
  }
}

function itemGuid(item: Parser.Item & { id?: string }): string | undefined {
  return item.guid ?? item.id ?? item.link;
}

function itemDate(item: Parser.Item): Date | undefined {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Fetches the source feed, extracts full text for new items, and caches them. */
export async function refreshFeed(feed: Feed): Promise<RefreshResult> {
  const runId = await startRun(feed.id);
  const result: RefreshResult = { itemsSeen: 0, itemsExtracted: 0, errors: 0 };
  let context: BrowserContext | undefined;

  try {
    const parsed = await parser.parseURL(feed.sourceUrl);
    const selectorConfig = parseSelectorConfig(feed.selectorConfig);
    const mode = feed.extractionMode as ExtractionMode;
    const items = (parsed.items ?? []).slice(0, feed.maxItems);
    result.itemsSeen = items.length;

    // Set up a browser context (authenticated if the feed maps to a site).
    if (feed.siteId) {
      const site = await getSite(feed.siteId);
      if (site && hasSession(site)) {
        context = await createSiteContext(site);
      } else {
        logger.warn({ feedId: feed.id, siteId: feed.siteId }, 'Site has no session; fetching unauthenticated');
      }
    }
    context ??= await newContext();

    for (const item of items) {
      const guid = itemGuid(item);
      const url = item.link;
      if (!guid || !url) continue;

      const existing = await getArticleByGuid(feed.id, guid);
      if (existing && existing.extractionStatus === 'ok') continue;

      try {
        const fetched = await fetchRenderedHtml(context, url, {
          waitForSelector: selectorConfig?.waitForSelector,
          waitMs: selectorConfig?.waitMs,
        });
        const extracted = extractArticle({
          html: fetched.html,
          url: fetched.url,
          mode,
          selectorConfig,
        });
        await upsertArticle({
          feedId: feed.id,
          guid,
          url,
          title: extracted.title ?? item.title ?? null,
          author: extracted.byline ?? item.creator ?? null,
          summary: extracted.excerpt ?? item.contentSnippet ?? null,
          contentHtml: extracted.contentHtml,
          contentHash: hash(extracted.contentHtml),
          extractionStatus: 'ok',
          extractionError: null,
          publishedAt: itemDate(item) ?? null,
          fetchedAt: new Date(),
        });
        result.itemsExtracted += 1;
      } catch (err) {
        result.errors += 1;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ feedId: feed.id, url, err: message }, 'Article extraction failed');
        await upsertArticle({
          feedId: feed.id,
          guid,
          url,
          title: item.title ?? null,
          author: item.creator ?? null,
          summary: item.contentSnippet ?? null,
          contentHtml: existing?.contentHtml ?? null,
          contentHash: existing?.contentHash ?? null,
          extractionStatus: 'failed',
          extractionError: message,
          publishedAt: itemDate(item) ?? null,
          fetchedAt: new Date(),
        });
      }
    }

    await markRefreshed(feed.id, null);
    await finishRun(runId, {
      status: 'success',
      itemsSeen: result.itemsSeen,
      itemsExtracted: result.itemsExtracted,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ feedId: feed.id, err: message }, 'Feed refresh failed');
    await markRefreshed(feed.id, message);
    await finishRun(runId, {
      status: 'error',
      itemsSeen: result.itemsSeen,
      itemsExtracted: result.itemsExtracted,
      error: message,
    });
    throw err;
  } finally {
    await context?.close();
  }
}
