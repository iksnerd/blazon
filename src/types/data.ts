import type { AssetCatalog, AssetCategoryInfo, IconSet } from './catalog.js';
import type { DocItem, SectionInfo, Vocabulary } from './docs.js';
import type { Finding } from './findings.js';
import type { LogoSet, BrandTheme, ThemeRole } from './theme.js';
import type { ParsedTokens } from './parsed.js';
import type { EmailSignatureConfig } from './config.js';

/** The license file in the folder of a font file the config lists, read by blazon: a plugin is never given the project folder, so brand.json carries the text */
export interface FontLicense {
  family: string;
  /** From the project root, with `/` separators */
  licenseFile: string;
  /** The file's text: UTF-8, at most 64 KiB, line breaks as `\n` */
  licenseText: string;
}

export interface BlazonData {
  title: string;
  description?: string;
  version?: string;
  tokens: ParsedTokens;
  /** `blazon check` findings (load problems plus rule checks), for the brand book's review view */
  findings: Finding[];
  /** Brand book theme: each role's resolved CSS value, from `config.theme` token paths */
  theme: BrandTheme;
  /** The token path behind each role in `theme`, so a resolver context that changes the token changes the role */
  themeTokens?: Partial<Record<ThemeRole, string>>;
  /** Font stylesheet URLs the brand book loads */
  fonts: string[];
  /** The license text found beside the font files of the config, one per family (absent when none was found): see `readFontLicense` */
  fontLicenses?: FontLicense[];
  /** Logo variants as data URIs: onLight for light backgrounds, onDark for dark ones */
  logo?: LogoSet;
  docs: DocItem[];
  assets: AssetCatalog;
  /**
   * Each asset category with its label, order and description from the `assets` config block, sorted:
   * configured `order` ascending (ties by name), then logos, then icons, then the rest by name
   */
  assetCategories?: AssetCategoryInfo[];
  /** Icon packages named in `iconSets`, with their categories */
  iconSets: IconSet[];
  /** The lockups and usage roles a value may name: the standard ones, then the brand's own */
  vocabulary: Vocabulary;
  /** Every section a page may declare: the standard ones, then the brand's own */
  sections: SectionInfo[];
  /** The `emailSignature` block of the config, for the `<!-- blazon:email-signature -->` directive */
  emailSignature?: EmailSignatureConfig;
}
