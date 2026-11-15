import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../types/index.js';
import { loadTokenDocuments, type TokenDocument } from './merge.js';
import type { TokenTree } from './walk.js';
import { jsonErrorLine, stripBom } from './key-lines.js';
import { finding } from '../checker/catalogue.js';

/** Parses a JSON token file into a document, or records why it could not. */
export function readTokenFile(fullPath: string, name: string, problems: Finding[], shown: string = name): TokenDocument | undefined {
  let text = '';
  try {
    text = stripBom(fs.readFileSync(fullPath, 'utf-8'));
    const content: unknown = JSON.parse(text);
    // A file whose top level is not an object holds no tokens: say so here, with the folder in the path as for a file that does not parse
    if (typeof content !== 'object' || content === null || Array.isArray(content)) {
      problems.push(finding('token-file-invalid', { path: shown, file: shown, message: 'Top level must be an object' }));
      return undefined;
    }
    return { name, content };
  } catch (err) {
    // A file that stops before its last brace or bracket is usually cut short: say so, as the parser's own message may not
    const early = text.length > 0 && !/[}\]]\s*$/.test(text) ? `; the file ends early, after ${text.trimEnd().length} characters, so it may be truncated` : '';
    const line = jsonErrorLine(String(err), text);
    problems.push(finding('token-file-invalid', { path: shown, file: shown, message: `${String(err)}${early}`, ...(line !== undefined && { line }) }));
    return undefined;
  }
}

/**
 * Reads every `.json` file in `tokensDir` into one token tree (RFC 0001 §1).
 * `root` is what the documents' names are relative to (default: the folder above `tokensDir`). File names are not part of token paths; files merge in name order, and a later
 * definition of the same path replaces an earlier one with a warning.
 */
export function loadTokenTree(tokensDir: string, root: string = path.dirname(tokensDir)): TokenTree {
  if (!fs.existsSync(tokensDir)) return { tokens: [], groupMeta: [], problems: [] };
  const problems: Finding[] = [];
  const documents = fs
    .readdirSync(tokensDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .sort()
    .flatMap((file) => {
      // A document is named by its file's path from the project root, as a resolver source is, so every token says where it is the same way
      const name = path.relative(root, path.join(tokensDir, file)).split(path.sep).join('/');
      return readTokenFile(path.join(tokensDir, file), name, problems) ?? [];
    });

  const tree = loadTokenDocuments(documents, { warnOnRedefinition: true });
  return { ...tree, problems: [...problems, ...tree.problems] };
}
