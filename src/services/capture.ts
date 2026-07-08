import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '../logger.js';
import { getSite } from '../repositories/sites.js';
import { newId } from '../util/ids.js';
import { parseStorageState, persistStorageState } from './site-session.js';

interface ActiveCapture {
  id: string;
  siteId: string;
  siteName: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  startedAt: Date;
  timeout: NodeJS.Timeout;
}

export interface CaptureStatus {
  id: string;
  siteId: string;
  siteName: string;
  startedAt: string;
}

// Only one capture at a time — there is a single (VNC) display to render into.
let active: ActiveCapture | null = null;
const CAPTURE_TTL_MS = 15 * 60 * 1000;

export function getActiveCapture(): CaptureStatus | null {
  if (!active) return null;
  return {
    id: active.id,
    siteId: active.siteId,
    siteName: active.siteName,
    startedAt: active.startedAt.toISOString(),
  };
}

async function teardown(): Promise<void> {
  if (!active) return;
  clearTimeout(active.timeout);
  const current = active;
  active = null;
  await current.browser.close().catch(() => undefined);
}

/**
 * Launches a headed Chromium at the site's login page so the user can sign in
 * interactively. In a container this renders to the Xvfb/VNC display exposed
 * through noVNC; locally it opens a native browser window.
 */
export async function startCapture(siteId: string): Promise<CaptureStatus> {
  if (active) throw new Error('A capture session is already in progress');
  const site = await getSite(siteId);
  if (!site) throw new Error('Site not found');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--start-maximized'],
  });
  const context = await browser.newContext({
    storageState: parseStorageState(site),
    viewport: null,
  });
  const page = await context.newPage();
  const startUrl = site.loginUrl || `https://${site.domain}`;
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);

  const id = newId('cap');
  const timeout = setTimeout(() => {
    logger.info({ captureId: id }, 'Capture session timed out');
    void teardown();
  }, CAPTURE_TTL_MS);

  active = {
    id,
    siteId,
    siteName: site.name,
    browser,
    context,
    page,
    startedAt: new Date(),
    timeout,
  };
  logger.info({ siteId, captureId: id }, 'Capture session started');
  return getActiveCapture()!;
}

/** Persists the current browser session for the site, then closes the browser. */
export async function saveCapture(id: string): Promise<void> {
  if (!active || active.id !== id) throw new Error('No matching capture session');
  const state = await active.context.storageState();
  await persistStorageState(active.siteId, state);
  logger.info({ siteId: active.siteId, captureId: id }, 'Capture session saved');
  await teardown();
}

export async function cancelCapture(id: string): Promise<void> {
  if (!active || active.id !== id) return;
  logger.info({ captureId: id }, 'Capture session cancelled');
  await teardown();
}

export async function closeActiveCapture(): Promise<void> {
  await teardown();
}
