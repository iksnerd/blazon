/** CSS custom property for a token path: prefix + kebab-cased path segments. */
export function generateCssVarName(prefix: string, pathParts: string[]): string {
  const cleanPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`;
  const parts = pathParts.map((p) =>
    p
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase(),
  );
  return `${cleanPrefix}${parts.join('-')}`;
}

/** The utility class `formatTypographyCss` emits for a typography token path, e.g. `type.bodyLarge` -> `type-body-large`. */
export function typographyClassName(tokenPath: string): string {
  return generateCssVarName('', tokenPath.split('.')).replace(/^-/, '');
}
