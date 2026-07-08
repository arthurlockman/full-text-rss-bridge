import { chromium, type Browser, type BrowserContext } from 'playwright';
import { logger } from '../logger.js';

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let browserPromise: Promise<Browser> | null = null;

/** Lazily launches (and reuses) a single headless Chromium instance. */
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    logger.info('Launching Chromium');
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

/** Creates a new browser context, optionally seeded with a stored session. */
export async function newContext(storageState?: StorageState): Promise<BrowserContext> {
  const browser = await getBrowser();
  return browser.newContext({
    storageState,
    userAgent: DEFAULT_UA,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
}

export interface FetchOptions {
  waitForSelector?: string;
  waitMs?: number;
  timeoutMs?: number;
}

export interface FetchResult {
  url: string;
  html: string;
  title: string;
}

/** Navigates to a URL in the given context and returns the rendered HTML. */
export async function fetchRenderedHtml(
  context: BrowserContext,
  targetUrl: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const timeout = opts.timeoutMs ?? 30_000;
  const page = await context.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });
    if (opts.waitForSelector) {
      await page
        .waitForSelector(opts.waitForSelector, { timeout: Math.min(timeout, 15_000) })
        .catch(() => undefined);
    }
    // Give late-loading (JS) content a chance to settle.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
    return { url: page.url(), html: await page.content(), title: await page.title() };
  } finally {
    await page.close();
  }
}
