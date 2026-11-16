/**
 * Config keys blazon read once and does not now, each with where its job went. The one place the core names a plugin that fills a
 * framework's job: the key is refused with this message, so a config that still has it fails instead of being ignored (RFC 0001 section 14).
 */
export const REMOVED_KEYS: Readonly<Record<string, string>> = {
  shadcn:
    'the "shadcn" key is gone: blazon.shadcn, a plugin blazon ships, takes the same map as its "variables" option. Use { "name": "blazon.shadcn", "options": { "variables": { ... } } } in plugins',
};
