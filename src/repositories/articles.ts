import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { articles, type Article, type NewArticle } from '../db/schema.js';
import { newId } from '../util/ids.js';

export async function getArticleByGuid(
  feedId: string,
  guid: string,
): Promise<Article | undefined> {
  return db
    .select()
    .from(articles)
    .where(and(eq(articles.feedId, feedId), eq(articles.guid, guid)))
    .get();
}

export async function upsertArticle(
  data: Omit<NewArticle, 'id' | 'createdAt'>,
): Promise<Article> {
  const existing = await getArticleByGuid(data.feedId, data.guid);
  if (existing) {
    await db.update(articles).set(data).where(eq(articles.id, existing.id));
    const updated = await db.select().from(articles).where(eq(articles.id, existing.id)).get();
    return updated!;
  }
  const id = newId('art');
  await db.insert(articles).values({ ...data, id });
  const created = await db.select().from(articles).where(eq(articles.id, id)).get();
  return created!;
}

/** Most recent successfully-extracted articles for a feed. */
export async function getFeedArticles(feedId: string, limit: number): Promise<Article[]> {
  return db
    .select()
    .from(articles)
    .where(and(eq(articles.feedId, feedId), eq(articles.extractionStatus, 'ok')))
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
    .limit(limit)
    .all();
}

export async function listFeedArticles(feedId: string, limit = 100): Promise<Article[]> {
  return db
    .select()
    .from(articles)
    .where(eq(articles.feedId, feedId))
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
    .limit(limit)
    .all();
}
