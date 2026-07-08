import { describe, it, expect } from 'vitest';
import { getRpConfig } from '../src/services/webauthn.js';

/**
 * The Relying Party ID and origin must be derived from PUBLIC_BASE_URL exactly
 * as the browser will report them, or WebAuthn verification fails. The test env
 * sets PUBLIC_BASE_URL=http://localhost:8080 (see vitest.config.ts).
 */
describe('webauthn RP config', () => {
  it('derives rpID (hostname) and origin from PUBLIC_BASE_URL', () => {
    const rp = getRpConfig();
    expect(rp.rpID).toBe('localhost');
    expect(rp.origin).toBe('http://localhost:8080');
    expect(rp.rpName).toBeTruthy();
  });
});
