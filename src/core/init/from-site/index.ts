// `blazon init --from <url>`: a starting point read from a company's live site. The page and its stylesheets give the
// brand colors, the fonts and a logo; none of it is confirmed, so every token and asset it writes is marked for review.

export { applyFromSite } from './apply.js';
export { cleanTitle } from './html.js';
export { inspectSite } from './inspect.js';
export { logoName } from './logo.js';
export type { ApplyOptions, FromSiteResult, SiteFindings, SitePage } from './types.js';
