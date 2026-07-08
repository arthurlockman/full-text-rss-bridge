import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

/**
 * The WebAuthn challenge issued during option generation must be echoed back
 * and verified against the user's signed assertion. We stash it in a signed,
 * httpOnly, short-lived cookie so no server-side session store is needed.
 */
const CHALLENGE_COOKIE = 'ftrb_webauthn_chal';
const secure = config.cookieSecure;

export function setChallenge(reply: FastifyReply, challenge: string): void {
  reply.setCookie(CHALLENGE_COOKIE, challenge, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: 300,
  });
}

export function getChallenge(req: FastifyRequest): string | null {
  const raw = req.cookies[CHALLENGE_COOKIE];
  if (!raw) return null;
  const result = req.unsignCookie(raw);
  return result.valid && result.value ? result.value : null;
}

export function clearChallenge(reply: FastifyReply): void {
  reply.clearCookie(CHALLENGE_COOKIE, { path: '/' });
}
