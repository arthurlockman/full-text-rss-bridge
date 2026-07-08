import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';

export interface SelectorConfig {
  /** CSS selector for the main content container (selector mode). */
  contentSelector?: string;
  /** Selectors to strip out of the extracted content. */
  removeSelectors?: string[];
  /** Selector the browser should wait for before extracting. */
  waitForSelector?: string;
  /** Extra settle time (ms) after load. */
  waitMs?: number;
}

export type ExtractionMode = 'readability' | 'selector';

export interface ExtractionInput {
  html: string;
  url: string;
  mode: ExtractionMode;
  selectorConfig?: SelectorConfig;
}

export interface ExtractionResult {
  title?: string;
  byline?: string;
  excerpt?: string;
  contentHtml: string;
}

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'img',
  'figure',
  'figcaption',
  'h1',
  'h2',
  'picture',
  'source',
];

function absolutize(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return value;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return undefined;
  }
}

/** Sanitizes extracted HTML and rewrites relative URLs against the article URL. */
function sanitize(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      source: ['srcset', 'type', 'media'],
      '*': ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: {
      a: (tagName, attribs) => {
        const href = absolutize(attribs.href, baseUrl);
        return { tagName, attribs: { ...attribs, ...(href ? { href, rel: 'noopener' } : {}) } };
      },
      img: (tagName, attribs) => {
        const src = absolutize(attribs.src, baseUrl);
        // Drop srcset to avoid leaking unresolved relative candidates.
        const { srcset: _srcset, ...rest } = attribs;
        return { tagName, attribs: { ...rest, ...(src ? { src } : {}) } };
      },
    },
  });
}

function extractWithReadability(input: ExtractionInput): ExtractionResult {
  const dom = new JSDOM(input.html, { url: input.url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) {
    throw new Error('Readability could not extract article content');
  }
  return {
    title: article.title ?? undefined,
    byline: article.byline ?? undefined,
    excerpt: article.excerpt ?? undefined,
    contentHtml: sanitize(article.content, input.url),
  };
}

function extractWithSelector(input: ExtractionInput): ExtractionResult {
  const selector = input.selectorConfig?.contentSelector;
  if (!selector) throw new Error('selector mode requires selectorConfig.contentSelector');

  const dom = new JSDOM(input.html, { url: input.url });
  const doc = dom.window.document;
  const node = doc.querySelector(selector);
  if (!node) throw new Error(`Content selector "${selector}" matched nothing`);

  for (const removeSel of input.selectorConfig?.removeSelectors ?? []) {
    node.querySelectorAll(removeSel).forEach((el) => el.remove());
  }

  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    doc.querySelector('title')?.textContent ??
    undefined;

  return {
    title: title?.trim() || undefined,
    contentHtml: sanitize(node.innerHTML, input.url),
  };
}

/** Extracts readable, sanitized article HTML from a raw page. */
export function extractArticle(input: ExtractionInput): ExtractionResult {
  return input.mode === 'selector' ? extractWithSelector(input) : extractWithReadability(input);
}
