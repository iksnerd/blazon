// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { chapterOf, pageFor, pageId, pageLinks, type LinkTargets } from '../../src/viewer/pages/print/links';

// A link from one page of the printed book to another has no server to answer it in a PDF, on paper, or in a PowerPoint made
// from pictures of the pages: it becomes a jump to the page inside the PDF and the page number after its words.

const ORIGIN = 'http://127.0.0.1:62181';
const targets: LinkTargets = {
  chapterPage: new Map([
    ['doc/voice', 15],
    ['doc/voice-bg', 16],
    ['doc/typography', 40],
  ]),
  headingPage: new Map([
    ['doc/typography#section-numbers-are-the-product', 42],
    ['doc/voice#section-numbers-are-the-product', 20],
  ]),
};

describe('chapterOf', () => {
  it('names the chapter a markdown file is, without folder, number prefix or extension', () => {
    expect(chapterOf('/01.2-voice-bg.md')).toBe('doc/voice-bg');
    expect(chapterOf('/docs/04-typography.md')).toBe('doc/typography');
    expect(chapterOf('/intro.markdown')).toBe('doc/intro');
  });
  it('is null for a path that is not a markdown file', () => {
    expect(chapterOf('/')).toBeNull();
    expect(chapterOf('/logo.svg')).toBeNull();
  });
});

describe('pageFor', () => {
  it('finds the page a link on this site points at', () => {
    expect(pageFor('01.2-voice-bg.md', ORIGIN, targets)).toBe(16);
    expect(pageFor(`${ORIGIN}/04-typography.md`, ORIGIN, targets)).toBe(40);
  });
  it('prefers the page of the heading a fragment names, and falls back to the chapter', () => {
    expect(pageFor('04-typography.md#numbers-are-the-product', ORIGIN, targets)).toBe(42);
    expect(pageFor('04-typography.md#no-such-heading', ORIGIN, targets)).toBe(40);
    // Two chapters may have a heading of the same name: the fragment is the chapter's own
    expect(pageFor('01.1-voice.md#numbers-are-the-product', ORIGIN, targets)).toBe(20);
  });
  it('is null for another site, for a chapter that is not in this print, and for a link that is not a page', () => {
    expect(pageFor('https://monzo.com/tone-of-voice/', ORIGIN, targets)).toBeNull();
    expect(pageFor('09-cards.md', ORIGIN, targets)).toBeNull();
    expect(pageFor('mailto:brand@example.com', ORIGIN, targets)).toBeNull();
    expect(pageFor('http://[bad', ORIGIN, targets)).toBeNull();
  });
});

describe('pageLinks', () => {
  function frame(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  }

  it('makes a page link a jump inside the PDF and puts the page number after its words', () => {
    const el = frame('<p>See <a href="01.2-voice-bg.md">Глас и тон (BG)</a>.</p>');
    expect(pageLinks(el, ORIGIN, targets)).toBe(1);
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe(`#${pageId(16)}`);
    expect(a.textContent).toBe('Глас и тон (BG), p. 16');
  });

  it('leaves a link to another site alone', () => {
    const el = frame('<a href="https://monzo.com/tone-of-voice/">Monzo</a>');
    expect(pageLinks(el, ORIGIN, targets)).toBe(0);
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://monzo.com/tone-of-voice/');
    expect(a.textContent).toBe('Monzo');
  });

  it('takes the dead address off a link to a file of the site, and keeps its words', () => {
    const el = frame('<a href="brand-assets/social/post.png">post.png</a> <a href="mailto:brand@example.com">mail</a>');
    expect(pageLinks(el, ORIGIN, targets)).toBe(0);
    const [file, mail] = el.querySelectorAll('a');
    expect(file!.hasAttribute('href')).toBe(false);
    expect(file!.textContent).toBe('post.png');
    expect(mail!.getAttribute('href')).toBe('mailto:brand@example.com');
  });

  it('does not add the page number twice when it runs again', () => {
    const el = frame('<a href="04-typography.md">Typography</a>');
    pageLinks(el, ORIGIN, targets);
    el.querySelector('a')!.setAttribute('href', '04-typography.md');
    pageLinks(el, ORIGIN, targets);
    expect(el.querySelector('a')!.textContent).toBe('Typography, p. 40');
  });
});
