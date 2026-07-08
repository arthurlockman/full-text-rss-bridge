import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';

function encryptionKey(): Buffer | null {
  if (!config.SESSION_ENCRYPTION_KEY) return null;
  // Normalize any provided key to a 32-byte key.
  return createHash('sha256').update(config.SESSION_ENCRYPTION_KEY).digest();
}

/** True when a SESSION_ENCRYPTION_KEY is configured. */
export function encryptionEnabled(): boolean {
  return encryptionKey() !== null;
}

/**
 * Encrypts a UTF-8 string, returning a compact `iv:tag:ciphertext` base64
 * bundle. Returns null when no encryption key is configured.
 */
export function encryptString(plaintext: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Decrypts a bundle produced by {@link encryptString}. */
export function decryptString(bundle: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('SESSION_ENCRYPTION_KEY is required to decrypt stored data');
  const [ivB64, tagB64, dataB64] = bundle.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted bundle');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
