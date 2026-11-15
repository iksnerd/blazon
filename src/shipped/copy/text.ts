// What the checks read of a page: its Markdown as blocks of prose, without code, comments, link targets or markup. A block is a heading, a
// paragraph, a list item or a table row. Every pass is linear in the text, because the text is the operator's own but may be long.

export interface Block {
  kind: 'heading' | 'paragraph' | 'item' | 'table';
  text: string;
}

/** Inline markup removed: code spans, images, link targets, tags and emphasis marks. */
function clean(text: string): string {
  return text
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The Markdown of a page as blocks, in order. Code fences and HTML comments (the directives) are skipped. */
export function blocksOf(markdown: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  let fence: string | undefined;
  let comment = false;
  const flush = () => {
    if (current && clean(current.text)) blocks.push({ kind: current.kind, text: clean(current.text) });
    current = undefined;
  };
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (fence) {
      if (trimmed.startsWith(fence)) fence = undefined;
      continue;
    }
    if (comment) {
      if (trimmed.includes('-->')) comment = false;
      continue;
    }
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      flush();
      fence = trimmed.slice(0, 3);
      continue;
    }
    if (trimmed.startsWith('<!--')) {
      flush();
      comment = !trimmed.includes('-->');
      continue;
    }
    if (trimmed === '') {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*?)\s*#*$/.exec(trimmed);
    if (heading) {
      flush();
      current = { kind: 'heading', text: heading[1]! };
      flush();
      continue;
    }
    if (trimmed.startsWith('|')) {
      flush();
      if (!/^[|\s:-]+$/.test(trimmed)) blocks.push({ kind: 'table', text: clean(trimmed.replace(/\|/g, ' ')) });
      continue;
    }
    const item = /^([-*+]|\d+[.)])\s+(.*)$/.exec(trimmed);
    if (item) {
      flush();
      current = { kind: 'item', text: item[2]! };
      continue;
    }
    const text = trimmed.replace(/^>\s?/, '');
    if (current) current.text += ` ${text}`;
    else current = { kind: 'paragraph', text };
  }
  flush();
  return blocks.filter((block) => block.text !== '');
}

const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|cf|fig|mr|mrs|dr)\./gi;

/** The sentences of a block of prose: a stop followed by a capital letter of any script, or a digit. A full stop in an abbreviation does not end one. */
export function sentencesOf(text: string): string[] {
  const protectedText = text.replace(ABBREVIATIONS, (match) => match.replace(/\./g, '\uE000'));
  return protectedText
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"'([])/u)
    .map((sentence) => sentence.replace(/\uE000/g, '.').trim())
    .filter((sentence) => sentence !== '');
}

/** The words of a sentence: each stretch of text with a letter or a digit in it. */
export const wordsOf = (sentence: string): string[] => sentence.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
