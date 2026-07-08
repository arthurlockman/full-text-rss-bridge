import cron, { type ScheduledTask } from 'node-cron';
import type { Feed } from '../db/schema.js';
import { logger } from '../logger.js';
import { getEnabledFeeds, getFeed } from '../repositories/feeds.js';
import { refreshFeed } from './ingestion.js';

const MAX_CONCURRENT = 2;

const running = new Set<string>();
const queue: Feed[] = [];
let active = 0;
let task: ScheduledTask | null = null;

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const feed = queue.shift()!;
    active += 1;
    running.add(feed.id);
    logger.info({ feedId: feed.id, name: feed.name }, 'Refreshing feed');
    refreshFeed(feed)
      .then((r) => logger.info({ feedId: feed.id, ...r }, 'Feed refresh complete'))
      .catch((err) => logger.error({ feedId: feed.id, err: String(err) }, 'Feed refresh error'))
      .finally(() => {
        active -= 1;
        running.delete(feed.id);
        pump();
      });
  }
}

function isQueuedOrRunning(feedId: string): boolean {
  return running.has(feedId) || queue.some((f) => f.id === feedId);
}

async function tick(): Promise<void> {
  const feeds = await getEnabledFeeds();
  const now = Date.now();
  for (const feed of feeds) {
    if (isQueuedOrRunning(feed.id)) continue;
    const last = feed.lastRefreshedAt ? feed.lastRefreshedAt.getTime() : 0;
    if (now - last >= feed.refreshIntervalMinutes * 60_000) {
      queue.push(feed);
    }
  }
  pump();
}

/** Manually enqueues a feed for immediate refresh (used by the UI). */
export async function triggerRefresh(feedId: string): Promise<boolean> {
  if (isQueuedOrRunning(feedId)) return false;
  const feed = await getFeed(feedId);
  if (!feed) return false;
  queue.push(feed);
  pump();
  return true;
}

/** Starts the once-per-minute scheduler and runs an initial tick. */
export function startScheduler(): void {
  task = cron.schedule('* * * * *', () => {
    void tick();
  });
  // Kick off an initial pass shortly after startup.
  setTimeout(() => void tick(), 5_000);
  logger.info('Scheduler started (every minute)');
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}
