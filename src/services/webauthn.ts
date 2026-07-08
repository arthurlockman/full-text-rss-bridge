import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { config } from '../config.js';
import type { Credential } from '../db/schema.js';
import { createCredential, listCredentials } from '../repositories/credentials.js';

/**
 * Relying Party (RP) configuration derived from PUBLIC_BASE_URL. The `rpID` is
 * the effective domain (hostname without port), and `origin` is the full
 * scheme+host+port the browser will report. These must match what the browser
 * sees, so PUBLIC_BASE_URL must be the URL users actually visit.
 */
export interface RpConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function getRpConfig(): RpConfig {
  const url = new URL(config.PUBLIC_BASE_URL);
  return {
    rpID: url.hostname,
    rpName: 'Full-Text RSS Bridge',
    // Origin excludes any trailing slash/path; include the port if present.
    origin: url.origin,
  };
}

/** A single logical admin user; the WebAuthn user handle is a fixed value. */
const ADMIN_USER_ID = new TextEncoder().encode('admin');
const ADMIN_USER_NAME = 'admin';

function toTransports(json: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as AuthenticatorTransportFuture[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds registration options. Existing credentials are excluded so the same
 * authenticator can't be enrolled twice. Returns the options to send to the
 * browser; the caller must persist `options.challenge` for later verification.
 */
export async function buildRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID, rpName } = getRpConfig();
  const existing = await listCredentials();
  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: ADMIN_USER_ID,
    userName: ADMIN_USER_NAME,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: toTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  const { rpID, origin } = getRpConfig();
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
}

type RegistrationInfo = NonNullable<VerifiedRegistrationResponse['registrationInfo']>;

/**
 * Persists a newly verified credential, encoding the binary public key as
 * base64url. `name` is a user-supplied friendly label (defaults to "Passkey").
 */
export async function persistRegistration(
  info: RegistrationInfo,
  name: string | undefined,
): Promise<void> {
  const { credential, credentialBackedUp } = info;
  const label = name?.trim() || 'Passkey';
  await createCredential({
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    backedUp: credentialBackedUp,
    name: label,
  });
}

/**
 * Builds authentication options allowing any registered credential. The caller
 * must persist `options.challenge` for later verification.
 */
export async function buildAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = getRpConfig();
  const existing = await listCredentials();
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: toTransports(c.transports),
    })),
    userVerification: 'preferred',
  });
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: Credential,
): Promise<VerifiedAuthenticationResponse> {
  const { rpID, origin } = getRpConfig();
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, 'base64url'),
      counter: credential.counter,
      transports: toTransports(credential.transports),
    },
  });
}
