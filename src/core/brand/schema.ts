import schema from './brand.schema.json' with { type: 'json' };

// The JSON Schema of brand.json (RFC 0001 §12), as a data file next to the code that writes the export. It is
// imported, so the library build carries it and `blazon build` can write it beside brand.json.

export const BRAND_SCHEMA = schema;

/** The file name the schema is written and served under, beside brand.json. */
export const BRAND_SCHEMA_FILE = 'brand.schema.json';

/** The schema as written: two-space JSON with a final newline. */
export function formatBrandSchema(): string {
  return `${JSON.stringify(BRAND_SCHEMA, null, 2)}\n`;
}
