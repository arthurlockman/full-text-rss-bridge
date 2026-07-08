import { getSetting, setSetting, SettingKeys } from '../repositories/settings.js';
import { hashPassword, verifyPassword } from '../util/crypto.js';

/** Whether an admin password has been configured (first-run check). */
export async function isAdminConfigured(): Promise<boolean> {
  const hash = await getSetting(SettingKeys.AdminPasswordHash);
  return !!hash;
}

export async function setAdminPassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const hash = await hashPassword(password);
  await setSetting(SettingKeys.AdminPasswordHash, hash);
}

export async function checkAdminPassword(password: string): Promise<boolean> {
  const hash = await getSetting(SettingKeys.AdminPasswordHash);
  if (!hash) return false;
  return verifyPassword(hash, password);
}

/** Marker value stored in the signed session cookie. */
export const SESSION_COOKIE = 'ftrb_session';
export const SESSION_VALUE = 'admin';
