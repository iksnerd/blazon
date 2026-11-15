// The packages a shipped plugin loads from node_modules when it runs, and so the only code of a plugin outside its pin
// (RFC 0005 section 3.4). scripts/build-plugins.mjs leaves them out of the bundles; the tests read this list too.
export const EXTERNAL = ['playwright-core', 'pdf-lib'];
