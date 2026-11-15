import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { STANDARD_SECTION_IDS, type DocItem, type DocFrontmatter, type Finding, type SectionId } from '../../types/index.js';
import { withoutFences } from './directives.js';
import { pageSections } from './sections.js';
import { finding } from '../checker/catalogue.js';
import { compareText } from '../order.js';

/**
 * Reads every Markdown page in `docsDir`. A page whose front matter is not valid YAML is left out
 * and reported in `problems`, so `blazon check` fails instead of the page silently losing its metadata.
 */
export function parseDocs(docsDir: string, problems: Finding[] = [], validSections: readonly SectionId[] = STANDARD_SECTION_IDS): DocItem[] {
  if (!fs.existsSync(docsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(docsDir)
    .filter((f) => (f.endsWith('.md') || f.endsWith('.markdown')) && !f.startsWith('.'))
    .sort();

  const docs: DocItem[] = [];

  for (const file of files) {
    const filePath = path.join(docsDir, file);
    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      let parsed: matter.GrayMatterFile<string>;
      try {
        // Options disable gray-matter's content cache, which otherwise answers a second parse of
        // broken YAML with a half-parsed result instead of the error
        parsed = matter(rawContent, {});
      } catch (err) {
        const reason = (err instanceof Error ? err.message.split('\n')[0]! : String(err)).replace(/:\s*$/, '');
        problems.push(finding('page-frontmatter-invalid', { path: file, message: `Front matter is not valid YAML: ${reason}. Quote values that contain ": "` }));
        continue;
      }
      const meta = (parsed.data || {}) as DocFrontmatter;

      // Extract numeric prefix if present (e.g. "01-intro.md" -> order 1, "07.1-photography.md" -> order 7.1)
      const baseName = path.basename(file, path.extname(file));
      const orderPrefix = /^(\d+(?:\.\d+)?)[-_.]/;
      const orderMatch = baseName.match(orderPrefix);
      const fileOrder = orderMatch ? parseFloat(orderMatch[1]!) : 999;
      const order = typeof meta.order === 'number' ? meta.order : fileOrder;

      // Clean slug: remove the numeric prefix
      const cleanSlug = baseName.replace(orderPrefix, '');

      // Infer title from frontmatter, or first H1, or clean slug
      if (meta.title !== undefined && meta.title !== null && typeof meta.title !== 'string') {
        problems.push(
          finding('page-frontmatter-invalid', {
            path: file,
            message: `Front matter \`title\` must be a string, not ${typeof meta.title}. Quote it: title: "${String(meta.title)}"`,
          }),
        );
        continue;
      }
      let title = meta.title;
      if (!title) {
        const h1Match = withoutFences(parsed.content).match(/^#[ \t]+(.+)$/m);
        if (h1Match && h1Match[1]) {
          title = h1Match[1].trim();
        } else {
          title = cleanSlug
            .split(/[-_]+/)
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(' ');
        }
      }

      // Compile Markdown to HTML
      const html = marked.parse(parsed.content, { async: false }) as string;

      docs.push({
        slug: cleanSlug,
        filePath: file,
        title,
        order,
        meta,
        sections: pageSections(meta.section, file, validSections, problems),
        markdown: parsed.content,
        html,
      });
    } catch (err) {
      // The reason is the error's code (EISDIR, EACCES) when it has one: its message holds the absolute path, which differs by machine
      const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
      const reason = code ?? (err instanceof Error ? err.message.split('\n')[0]! : String(err));
      problems.push(finding('page-unreadable', { path: file, message: `Cannot read this page (${reason}); it is left out of the book` }));
    }
  }

  const first = new Map<string, string>();
  for (const doc of docs) {
    const earlier = first.get(doc.slug);
    if (earlier === undefined) first.set(doc.slug, doc.filePath);
    else
      problems.push(
        finding('page-slug-duplicate', {
          path: doc.filePath,
          message: `${earlier} and ${doc.filePath} both have the slug "${doc.slug}"; the book opens only ${earlier}. Rename one of them`,
        }),
      );
  }

  // Sort by order asc, then title asc
  docs.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return compareText(a.title, b.title);
  });

  return docs;
}
