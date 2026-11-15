/**
 * The public blazon website, where the manual is served: `/docs` is its index and `/docs/<chapter>` a chapter, named as the file in
 * `docs/manual/` without its number (`03-checks.md` is `/docs/checks`). Each page is also served as Markdown to a request that sends
 * `Accept: text/markdown`. A Vercel address until blazon has a domain; the starter's `AGENTS.md` names it once, and its test holds it to this value.
 */
export const SITE_URL = 'https://blazon-website-drab.vercel.app';
