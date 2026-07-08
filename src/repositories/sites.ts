import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, type NewSite, type Site } from '../db/schema.js';
import { newId } from '../util/ids.js';

export async function listSites(): Promise<Site[]> {
  return db.select().from(sites).orderBy(sites.name).all();
}

export async function getSite(id: string): Promise<Site | undefined> {
  return db.select().from(sites).where(eq(sites.id, id)).get();
}

export async function createSite(
  data: Omit<NewSite, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Site> {
  const id = newId('site');
  await db.insert(sites).values({ ...data, id });
  const created = await getSite(id);
  if (!created) throw new Error('Failed to create site');
  return created;
}

export async function updateSite(id: string, data: Partial<NewSite>): Promise<void> {
  await db
    .update(sites)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sites.id, id));
}

export async function deleteSite(id: string): Promise<void> {
  await db.delete(sites).where(eq(sites.id, id));
}
