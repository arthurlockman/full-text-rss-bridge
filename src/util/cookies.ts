import type { StorageState } from '../services/browser.js';

type PWCookie = StorageState['cookies'][number];
type SameSite = PWCookie['sameSite'];

interface RawCookie {
  name?: string;
  key?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: number;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

function normalizeSameSite(value: string | undefined): SameSite {
  switch ((value ?? '').toLowerCase()) {
    case 'strict':
      return 'Strict';
    case 'none':
    case 'no_restriction':
      return 'None';
    case 'lax':
    default:
      return 'Lax';
  }
}

function normalizeCookie(raw: RawCookie): PWCookie {
  const name = raw.name ?? raw.key;
  if (!name) throw new Error('Cookie is missing a name');
  if (raw.value === undefined) throw new Error(`Cookie "${name}" is missing a value`);
  if (!raw.domain) throw new Error(`Cookie "${name}" is missing a domain`);

  const expires =
    typeof raw.expires === 'number'
      ? raw.expires
      : typeof raw.expirationDate === 'number'
        ? Math.floor(raw.expirationDate)
        : -1;

  return {
    name,
    value: raw.value,
    domain: raw.domain,
    path: raw.path ?? '/',
    expires,
    httpOnly: raw.httpOnly ?? false,
    secure: raw.secure ?? false,
    sameSite: normalizeSameSite(raw.sameSite),
  };
}

/**
 * Parses pasted session JSON into a Playwright storageState. Accepts either a
 * full storageState object (`{ cookies, origins }`) or a bare cookies array as
 * exported by common browser extensions (Cookie-Editor, EditThisCookie).
 */
export function parseImportedSession(rawJson: string): StorageState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Pasted session is not valid JSON');
  }

  if (Array.isArray(parsed)) {
    return { cookies: parsed.map((c) => normalizeCookie(c as RawCookie)), origins: [] };
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { cookies?: unknown }).cookies)) {
    const obj = parsed as { cookies: RawCookie[]; origins?: StorageState['origins'] };
    return {
      cookies: obj.cookies.map(normalizeCookie),
      origins: obj.origins ?? [],
    };
  }

  throw new Error('Unrecognized session format: expected a cookies array or a storageState object');
}
