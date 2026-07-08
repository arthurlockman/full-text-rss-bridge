import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { SESSION_COOKIE, SESSION_VALUE } from '../services/auth.js';

const secure = config.cookieSecure;

export function isAuthed(req: FastifyRequest): boolean {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return false;
  const result = req.unsignCookie(raw);
  return result.valid && result.value === SESSION_VALUE;
}

export function setSession(reply: FastifyReply): void {
  reply.setCookie(SESSION_COOKIE, SESSION_VALUE, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
