import type { BrowserContext } from 'playwright';
import type { Site } from '../db/schema.js';
import { updateSite } from '../repositories/sites.js';
import { decryptString, encryptString, encryptionEnabled } from '../util/crypto.js';
import { newContext, type StorageState } from './browser.js';

/** Decrypts (if needed) and parses a site's stored Playwright session. */
export function parseStorageState(site: Site): StorageState | undefined {
  if (!site.storageState) return undefined;
  const raw = site.storageEncrypted ? decryptString(site.storageState) : site.storageState;
  return JSON.parse(raw) as StorageState;
}

/** Persists a captured session for a site, encrypting at rest when configured. */
export async function persistStorageState(siteId: string, state: StorageState): Promise<void> {
  const json = JSON.stringify(state);
  if (encryptionEnabled()) {
    const encrypted = encryptString(json);
    if (!encrypted) throw new Error('Encryption unexpectedly disabled');
    await updateSite(siteId, {
      storageState: encrypted,
      storageEncrypted: true,
      sessionStatus: 'valid',
      lastValidatedAt: new Date(),
    });
  } else {
    await updateSite(siteId, {
      storageState: json,
      storageEncrypted: false,
      sessionStatus: 'valid',
      lastValidatedAt: new Date(),
    });
  }
}

/** True when the site has a stored session. */
export function hasSession(site: Site): boolean {
  return !!site.storageState;
}

/** Creates a browser context seeded with the site's stored session. */
export async function createSiteContext(site: Site): Promise<BrowserContext> {
  return newContext(parseStorageState(site));
}
