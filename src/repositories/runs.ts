import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { runs, type Run } from '../db/schema.js';
import { newId } from '../util/ids.js';

export async function startRun(feedId: string): Promise<string> {
  const id = newId('run');
  await db.insert(runs).values({ id, feedId, status: 'running' });
  return id;
}

export async function finishRun(
  id: string,
  data: { status: 'success' | 'error'; itemsSeen: number; itemsExtracted: number; error?: string },
): Promise<void> {
  await db
    .update(runs)
    .set({
      status: data.status,
      itemsSeen: data.itemsSeen,
      itemsExtracted: data.itemsExtracted,
      error: data.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(runs.id, id));
}

export async function recentRuns(feedId: string, limit = 20): Promise<Run[]> {
  return db
    .select()
    .from(runs)
    .where(eq(runs.feedId, feedId))
    .orderBy(desc(runs.startedAt))
    .limit(limit)
    .all();
}
