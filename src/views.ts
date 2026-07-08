import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import { config } from './config.js';

/**
 * Template and static-asset directories, resolved relative to this module so
 * they work both in dev (src/) and after build (dist/, where the build step
 * copies views/ and public/).
 */
export const viewsDir = fileURLToPath(new URL('./views', import.meta.url));
export const publicDir = fileURLToPath(new URL('./public', import.meta.url));

const eta = new Eta({
  views: viewsDir,
  cache: config.NODE_ENV === 'production',
});

/** Renders a `.eta` template (name without extension) to an HTML string. */
export function renderPage(name: string, data: Record<string, unknown> = {}): string {
  return eta.render(name, data);
}
