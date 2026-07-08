import type { FastifyInstance } from 'fastify';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { renderPage } from '../views.js';
import { ensureCsrfToken, verifyCsrfHeader } from '../http/csrf.js';
import { clearSession, isAuthed, setSession } from '../http/session.js';
import { clearChallenge, getChallenge, setChallenge } from '../http/challenge.js';
import { isAdminConfigured } from '../services/auth.js';
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  persistRegistration,
  verifyAuthentication,
  verifyRegistration,
} from '../services/webauthn.js';
import {
  getCredentialByCredentialId,
  updateCredentialCounter,
} from '../repositories/credentials.js';

interface RegistrationBody {
  response?: RegistrationResponseJSON;
  name?: string;
}

interface AuthenticationBody {
  response?: AuthenticationResponseJSON;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // --- First-run: enroll the first passkey ---
  app.get('/setup', async (req, reply) => {
    if (await isAdminConfigured()) return reply.redirect('/');
    const csrf = ensureCsrfToken(req, reply);
    return reply.type('text/html').send(renderPage('setup', { csrf }));
  });

  app.post('/setup/options', async (req, reply) => {
    if (await isAdminConfigured()) return reply.code(403).send({ error: 'Already configured' });
    if (!verifyCsrfHeader(req)) return reply.code(403).send({ error: 'Invalid CSRF token' });
    const options = await buildRegistrationOptions();
    setChallenge(reply, options.challenge);
    return reply.send(options);
  });

  app.post<{ Body: RegistrationBody }>('/setup/verify', async (req, reply) => {
    if (await isAdminConfigured()) return reply.code(403).send({ error: 'Already configured' });
    if (!verifyCsrfHeader(req)) return reply.code(403).send({ error: 'Invalid CSRF token' });
    const challenge = getChallenge(req);
    const response = req.body?.response;
    if (!challenge || !response) return reply.code(400).send({ error: 'Missing challenge' });

    try {
      const verification = await verifyRegistration(response, challenge);
      clearChallenge(reply);
      if (!verification.verified || !verification.registrationInfo) {
        return reply.code(400).send({ error: 'Registration could not be verified' });
      }
      await persistRegistration(verification.registrationInfo, req.body?.name);
      setSession(reply);
      return reply.send({ ok: true, redirect: '/' });
    } catch (err) {
      req.log.warn({ err }, 'Passkey registration failed');
      clearChallenge(reply);
      return reply.code(400).send({ error: 'Registration failed' });
    }
  });

  // --- Login with a registered passkey ---
  app.get('/login', async (req, reply) => {
    if (!(await isAdminConfigured())) return reply.redirect('/setup');
    if (isAuthed(req)) return reply.redirect('/');
    const csrf = ensureCsrfToken(req, reply);
    return reply.type('text/html').send(renderPage('login', { csrf }));
  });

  app.post('/login/options', async (req, reply) => {
    if (!verifyCsrfHeader(req)) return reply.code(403).send({ error: 'Invalid CSRF token' });
    const options = await buildAuthenticationOptions();
    setChallenge(reply, options.challenge);
    return reply.send(options);
  });

  app.post<{ Body: AuthenticationBody }>('/login/verify', async (req, reply) => {
    if (!verifyCsrfHeader(req)) return reply.code(403).send({ error: 'Invalid CSRF token' });
    const challenge = getChallenge(req);
    const response = req.body?.response;
    if (!challenge || !response) return reply.code(400).send({ error: 'Missing challenge' });

    const credential = await getCredentialByCredentialId(response.id);
    if (!credential) {
      clearChallenge(reply);
      return reply.code(400).send({ error: 'Unknown passkey' });
    }

    try {
      const verification = await verifyAuthentication(response, challenge, credential);
      clearChallenge(reply);
      if (!verification.verified) return reply.code(400).send({ error: 'Authentication failed' });
      await updateCredentialCounter(
        credential.credentialId,
        verification.authenticationInfo.newCounter,
      );
      setSession(reply);
      return reply.send({ ok: true, redirect: '/' });
    } catch (err) {
      req.log.warn({ err }, 'Passkey authentication failed');
      clearChallenge(reply);
      return reply.code(400).send({ error: 'Authentication failed' });
    }
  });

  app.post('/logout', async (_req, reply) => {
    clearSession(reply);
    return reply.redirect('/login');
  });
}
