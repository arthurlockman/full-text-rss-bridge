import { customAlphabet } from 'nanoid';

// URL-safe, unambiguous alphabet for ids and feed tokens.
const idAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const tokenAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const makeId = customAlphabet(idAlphabet, 16);
const makeToken = customAlphabet(tokenAlphabet, 32);

/** Short, collision-resistant id for primary keys. */
export function newId(prefix?: string): string {
  const id = makeId();
  return prefix ? `${prefix}_${id}` : id;
}

/** Long, unguessable token for public feed URLs. */
export function newFeedToken(): string {
  return makeToken();
}
