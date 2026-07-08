import { describe, it, expect } from 'vitest';
import { extractArticle } from '../src/services/extraction.js';

const BASE = 'https://example.com/posts/1';

describe('extractArticle — readability mode', () => {
  it('extracts the main body and strips scripts', () => {
    const html = `<!doctype html><html><head><title>My Great Post</title></head>
      <body>
        <header><nav>home about contact</nav></header>
        <article>
          <h1>My Great Post</h1>
          <p>Defector is a worker-owned sports and culture website with a lot of
             heart and even more words. This paragraph exists purely so that the
             Readability algorithm has enough textual content to lock onto the
             article body and score it above the surrounding chrome.</p>
          <p>Here is a second substantial paragraph of the article body. It keeps
             going with more sentences to make sure the extractor is confident
             that this element is the real content of the page and not a sidebar.</p>
          <script>window.evilTracker = function () { steal(); };</script>
        </article>
        <footer>copyright</footer>
      </body></html>`;

    const result = extractArticle({ html, url: BASE, mode: 'readability' });

    expect(result.title).toContain('My Great Post');
    expect(result.contentHtml).toContain('worker-owned sports and culture');
    expect(result.contentHtml).toContain('second substantial paragraph');
    expect(result.contentHtml).not.toContain('evilTracker');
    expect(result.contentHtml).not.toContain('<script');
  });
});

describe('extractArticle — selector mode', () => {
  const html = `<!doctype html><html><head>
      <meta property="og:title" content="Selector Title">
      <title>fallback title</title></head>
      <body>
        <div class="article-body">
          <p>Kept paragraph body text.</p>
          <div class="ad">BUY NOW spam</div>
          <img src="images/pic.png" alt="pic" srcset="images/pic-2x.png 2x">
          <a href="../other">related</a>
        </div>
        <div class="article-body">second match ignored</div>
      </body></html>`;

  it('uses the content selector and removes unwanted nodes', () => {
    const result = extractArticle({
      html,
      url: BASE,
      mode: 'selector',
      selectorConfig: { contentSelector: '.article-body', removeSelectors: ['.ad'] },
    });

    expect(result.title).toBe('Selector Title');
    expect(result.contentHtml).toContain('Kept paragraph body text.');
    expect(result.contentHtml).not.toContain('BUY NOW');
  });

  it('absolutizes relative img/href URLs and drops srcset', () => {
    const result = extractArticle({
      html,
      url: BASE,
      mode: 'selector',
      selectorConfig: { contentSelector: '.article-body' },
    });

    // images/pic.png resolved against .../posts/1 -> .../posts/images/pic.png
    expect(result.contentHtml).toContain('https://example.com/posts/images/pic.png');
    expect(result.contentHtml).not.toContain('srcset');
    // ../other resolved against .../posts/1 -> .../other
    expect(result.contentHtml).toContain('href="https://example.com/other"');
  });

  it('throws when the content selector matches nothing', () => {
    expect(() =>
      extractArticle({
        html: '<body><p>hi</p></body>',
        url: BASE,
        mode: 'selector',
        selectorConfig: { contentSelector: '.missing' },
      }),
    ).toThrow(/matched nothing/);
  });

  it('throws when selector mode has no contentSelector', () => {
    expect(() => extractArticle({ html: '<body></body>', url: BASE, mode: 'selector' })).toThrow(
      /requires selectorConfig.contentSelector/,
    );
  });
});

describe('extractArticle — sanitization', () => {
  it('strips event handlers and disallowed tags but keeps images', () => {
    const html = `<body><div class="c">
        <p onclick="steal()">clickme</p>
        <img src="/a/pic.png" alt="ok">
        <iframe src="https://evil.example/frame"></iframe>
        <figure><figcaption>cap</figcaption></figure>
      </div></body>`;
    const result = extractArticle({
      html,
      url: BASE,
      mode: 'selector',
      selectorConfig: { contentSelector: '.c' },
    });
    expect(result.contentHtml).not.toContain('onclick');
    expect(result.contentHtml).not.toContain('<iframe');
    expect(result.contentHtml).toContain('<img');
    expect(result.contentHtml).toContain('https://example.com/a/pic.png');
    expect(result.contentHtml).toContain('<figcaption>cap</figcaption>');
  });
});
