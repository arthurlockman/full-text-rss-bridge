import { describe, it, expect } from 'vitest';
import { parseImportedSession } from '../src/util/cookies.js';

describe('parseImportedSession', () => {
  it('passes through a full storageState object', () => {
    const input = JSON.stringify({
      cookies: [{ name: 'sid', value: 'abc', domain: '.defector.com', path: '/' }],
      origins: [{ origin: 'https://defector.com', localStorage: [{ name: 'k', value: 'v' }] }],
    });
    const state = parseImportedSession(input);
    expect(state.cookies).toHaveLength(1);
    expect(state.cookies[0]).toMatchObject({ name: 'sid', value: 'abc', domain: '.defector.com' });
    expect(state.origins).toHaveLength(1);
  });

  it('accepts a bare cookies array from a browser extension', () => {
    const input = JSON.stringify([
      {
        name: 'sess',
        value: 'xyz',
        domain: '.defector.com',
        path: '/app',
        expirationDate: 1799999999.7,
        httpOnly: true,
        secure: true,
        sameSite: 'no_restriction',
      },
    ]);
    const state = parseImportedSession(input);
    expect(state.origins).toEqual([]);
    expect(state.cookies[0]).toEqual({
      name: 'sess',
      value: 'xyz',
      domain: '.defector.com',
      path: '/app',
      expires: 1799999999, // floored from expirationDate
      httpOnly: true,
      secure: true,
      sameSite: 'None', // normalized from no_restriction
    });
  });

  it('maps the `key` alias to name and defaults path/expires', () => {
    const input = JSON.stringify([{ key: 'token', value: 't', domain: 'defector.com' }]);
    const state = parseImportedSession(input);
    expect(state.cookies[0]).toMatchObject({
      name: 'token',
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    });
  });

  it('normalizes sameSite variants', () => {
    const mk = (s: string) =>
      parseImportedSession(JSON.stringify([{ name: 'c', value: 'v', domain: 'd', sameSite: s }]))
        .cookies[0]!.sameSite;
    expect(mk('Strict')).toBe('Strict');
    expect(mk('lax')).toBe('Lax');
    expect(mk('none')).toBe('None');
    expect(mk('weird')).toBe('Lax');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseImportedSession('{not json')).toThrow(/not valid JSON/);
  });

  it('throws when a cookie is missing required fields', () => {
    expect(() => parseImportedSession(JSON.stringify([{ value: 'v', domain: 'd' }]))).toThrow(
      /missing a name/,
    );
    expect(() => parseImportedSession(JSON.stringify([{ name: 'n', domain: 'd' }]))).toThrow(
      /missing a value/,
    );
    expect(() => parseImportedSession(JSON.stringify([{ name: 'n', value: 'v' }]))).toThrow(
      /missing a domain/,
    );
  });

  it('throws on an unrecognized shape', () => {
    expect(() => parseImportedSession(JSON.stringify({ foo: 'bar' }))).toThrow(/Unrecognized/);
  });
});
