import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

const CSRF_COOKIE = 'ftrb_csrf';
const secure = config.cookieSecure;

/**
 * Double-submit CSRF: ensures a signed CSRF cookie exists and returns its
 * value so it can be embedded as a hidden form field.
 */
export function ensureCsrfToken(req: FastifyRequest, reply: FastifyReply): string {
  const existing = req.cookies[CSRF_COOKIE];
  if (existing) {
    const unsigned = req.unsignCookie(existing);
    if (unsigned.valid && unsigned.value) return unsigned.value;
  }
  const token = randomBytes(24).toString('base64url');
  reply.setCookie(CSRF_COOKIE, token, {
    signed: true,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure,
  });
  return token;
}

/** Verifies the submitted `_csrf` field against the signed cookie. */
export function verifyCsrf(req: FastifyRequest, submitted: unknown): boolean {
  const cookie = req.cookies[CSRF_COOKIE];
  if (!cookie || typeof submitted !== 'string' || submitted.length === 0) return false;
  const unsigned = req.unsignCookie(cookie);
  return unsigned.valid && unsigned.value === submitted;
}
