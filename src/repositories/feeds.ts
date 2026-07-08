import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { feeds, type Feed, type NewFeed } from '../db/schema.js';
import { newFeedToken, newId } from '../util/ids.js';

export async function listFeeds(): Promise<Feed[]> {
  return db.select().from(feeds).orderBy(feeds.name).all();
}

export async function getFeed(id: string): Promise<Feed | undefined> {
  return db.select().from(feeds).where(eq(feeds.id, id)).get();
}

export async function getFeedByToken(token: string): Promise<Feed | undefined> {
  return db.select().from(feeds).where(eq(feeds.accessToken, token)).get();
}

export async function getEnabledFeeds(): Promise<Feed[]> {
  return db.select().from(feeds).where(eq(feeds.enabled, true)).all();
}

export async function createFeed(
  data: Omit<NewFeed, 'id' | 'accessToken' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<NewFeed, 'accessToken'>>,
): Promise<Feed> {
  const id = newId('feed');
  const accessToken = data.accessToken ?? newFeedToken();
  await db.insert(feeds).values({ ...data, id, accessToken });
  const created = await getFeed(id);
  if (!created) throw new Error('Failed to create feed');
  return created;
}

export async function updateFeed(id: string, data: Partial<NewFeed>): Promise<void> {
  await db
    .update(feeds)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(feeds.id, id));
}

export async function deleteFeed(id: string): Promise<void> {
  await db.delete(feeds).where(eq(feeds.id, id));
}

export async function markRefreshed(id: string, error: string | null): Promise<void> {
  await db
    .update(feeds)
    .set({ lastRefreshedAt: new Date(), lastError: error, updatedAt: new Date() })
    .where(eq(feeds.id, id));
}

export function rotateToken(id: string): Promise<void> {
  return updateFeed(id, { accessToken: newFeedToken() });
}
