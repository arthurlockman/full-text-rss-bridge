import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { credentials, type Credential, type NewCredential } from '../db/schema.js';
import { newId } from '../util/ids.js';

export async function listCredentials(): Promise<Credential[]> {
  return db.select().from(credentials).orderBy(credentials.createdAt).all();
}

export async function countCredentials(): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(credentials)
    .get();
  return row?.count ?? 0;
}

export async function getCredentialByCredentialId(
  credentialId: string,
): Promise<Credential | undefined> {
  return db.select().from(credentials).where(eq(credentials.credentialId, credentialId)).get();
}

export async function createCredential(
  data: Omit<NewCredential, 'id' | 'createdAt'>,
): Promise<Credential> {
  const id = newId('cred');
  await db.insert(credentials).values({ ...data, id });
  const created = await db.select().from(credentials).where(eq(credentials.id, id)).get();
  if (!created) throw new Error('Failed to create credential');
  return created;
}

export async function updateCredentialCounter(
  credentialId: string,
  counter: number,
): Promise<void> {
  await db
    .update(credentials)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(credentials.credentialId, credentialId));
}

export async function deleteCredential(id: string): Promise<void> {
  await db.delete(credentials).where(eq(credentials.id, id));
}
