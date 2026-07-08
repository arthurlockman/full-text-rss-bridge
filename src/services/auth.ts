import { countCredentials } from '../repositories/credentials.js';

/**
 * Whether at least one passkey has been registered (first-run check). Before
 * any credential exists, the app funnels the user to /setup to enroll one.
 */
export async function isAdminConfigured(): Promise<boolean> {
  return (await countCredentials()) > 0;
}

/** Marker value stored in the signed session cookie. */
export const SESSION_COOKIE = 'ftrb_session';
export const SESSION_VALUE = 'admin';
