import type { FastifyInstance } from 'fastify';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { renderPage } from '../views.js';
import { ensureCsrfToken, verifyCsrf, verifyCsrfHeader } from '../http/csrf.js';
import { clearChallenge, getChallenge, setChallenge } from '../http/challenge.js';
import { buildRegistrationOptions, persistRegistration, verifyRegistration } from '../services/webauthn.js';
import {
  countCredentials,
  deleteCredential,
  listCredentials,
} from '../repositories/credentials.js';

interface RegistrationBody {
  response?: RegistrationResponseJSON;
  name?: string;
}

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/settings', async (req, reply) => {
    const csrf = ensureCsrfToken(req, reply);
    const passkeys = await listCredentials();
    return reply
      .type('text/html')
      .send(renderPage('settings', { title: 'Settings', csrf, passkeys, query: req.query }));
  });

  // Register an additional passkey (authenticated).
  app.post('/settings/passkeys/options', async (req, reply) => {
    if (!verifyCsrfHeader(req)) return reply.code(403).send({ error: 'Invalid CSRF token' });
    const options = await buildRegistrationOptions();
    setChallenge(reply, options.challenge);
    return reply.send(options);
  });

  app.post<{ Body: RegistrationBody }>('/settings/passkeys/verify', async (req, reply) => {
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
      return reply.send({ ok: true, redirect: '/settings' });
    } catch (err) {
      req.log.warn({ err }, 'Passkey registration failed');
      clearChallenge(reply);
      return reply.code(400).send({ error: 'Registration failed' });
    }
  });

  // Remove a passkey. The last remaining passkey cannot be removed, otherwise
  // the instance would be locked out.
  app.post<{ Params: { id: string }; Body: { _csrf?: string } }>(
    '/settings/passkeys/:id/delete',
    async (req, reply) => {
      if (!verifyCsrf(req, req.body?._csrf)) {
        return reply.redirect('/settings?err=Retry');
      }
      if ((await countCredentials()) <= 1) {
        return reply.redirect('/settings?err=Cannot+remove+your+only+passkey');
      }
      await deleteCredential(req.params.id);
      return reply.redirect('/settings?msg=Passkey+removed');
    },
  );
}
