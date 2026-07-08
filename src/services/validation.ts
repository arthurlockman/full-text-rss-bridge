import type { Site } from '../db/schema.js';
import { logger } from '../logger.js';
import { updateSite } from '../repositories/sites.js';
import { newContext } from './browser.js';
import { parseStorageState } from './site-session.js';

export type SessionStatus = 'valid' | 'expired' | 'error' | 'unknown';

/**
 * Loads a site's stored session against its validation URL and updates the
 * recorded session status. When a `loggedInSelector` is set, the session is
 * considered valid only if that selector is present after load.
 */
export async function validateSite(site: Site): Promise<SessionStatus> {
  if (!site.storageState) {
    await updateSite(site.id, { sessionStatus: 'unknown', lastValidatedAt: new Date() });
    return 'unknown';
  }

  const url = site.validationUrl || `https://${site.domain}`;
  const context = await newContext(parseStorageState(site));
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    let loggedIn = true;
    if (site.loggedInSelector) {
      loggedIn = (await page.locator(site.loggedInSelector).count()) > 0;
    }

    const status: SessionStatus = loggedIn ? 'valid' : 'expired';
    await updateSite(site.id, { sessionStatus: status, lastValidatedAt: new Date() });
    return status;
  } catch (err) {
    logger.warn({ siteId: site.id, err: String(err) }, 'Session validation failed');
    await updateSite(site.id, { sessionStatus: 'error', lastValidatedAt: new Date() });
    return 'error';
  } finally {
    await context.close();
  }
}
