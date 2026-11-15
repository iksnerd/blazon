/**
 * The standard sections of a brand book (RFC 0001 §13). A page declares the ones it holds with `section:` in its
 * front matter, and blazon reports the ones no page holds. A brand adds its own in `customSections` (RFC 0002 §1).
 */
export const STANDARD_SECTION_IDS = [
  'intro',
  'logo',
  'color',
  'typography',
  'icons',
  'illustration',
  'photography',
  'patterns',
  '3d',
  'diagrams',
  'motion',
  'layout',
  'social',
  'applications',
] as const;
export type SectionId = string;

/** The fixed titles of the standard sections, so a list of sections is complete without the brand's own words. */
export const STANDARD_SECTION_TITLES: Record<(typeof STANDARD_SECTION_IDS)[number], string> = {
  intro: 'Introduction',
  logo: 'Logo',
  color: 'Color',
  typography: 'Typography',
  icons: 'Icons',
  illustration: 'Illustration',
  photography: 'Photography',
  patterns: 'Patterns',
  '3d': '3D graphics',
  diagrams: 'Diagrams',
  motion: 'Motion',
  layout: 'Layout',
  social: 'Social',
  applications: 'Applications',
};

/** A section a page may declare: a standard one, or one the brand added. */
export interface SectionInfo {
  id: SectionId;
  title: string;
  standard: boolean;
}

/** The names blazon checks a value against, the standard ones first and then the brand's additions (RFC 0002 §1). */
export interface Vocabulary {
  lockups: string[];
  usageRoles: string[];
}

export interface DocFrontmatter {
  title?: string;
  order?: number;
  description?: string;
  group?: string;
  /** `full`: a full-height cover; `compact`: a short header. Default: full for the first page, compact for the rest */
  opener?: 'full' | 'compact';
  [key: string]: unknown;
}

export interface DocItem {
  /** Filename slug without the ordering prefix, e.g. "intro" for 01-intro.md, or "colors" */
  slug: string;
  /** Relative file path */
  filePath: string;
  /** Title from frontmatter or inferred from H1 / filename */
  title: string;
  /** Sort order from frontmatter or filename prefix (e.g. 01-) */
  order: number;
  /** Frontmatter metadata */
  meta: DocFrontmatter;
  /** The standard sections the page holds, from `section:` in the front matter; once each, standard ids only */
  sections: SectionId[];
  /** Raw markdown content without frontmatter */
  markdown: string;
  /** Compiled HTML content */
  html: string;
}
