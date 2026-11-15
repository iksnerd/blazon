// The Google Fonts stylesheets blazon knows how to link, shared by `blazon init` and what it reads from a site.

/** The families a built-in stylesheet link is written for. Any other family needs its stylesheet added by hand. */
export const GOOGLE_FAMILIES = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Manrope',
  'Mulish',
  'Nunito',
  'Source Sans 3',
  'DM Sans',
  'Work Sans',
  'IBM Plex Sans',
  'Space Grotesk',
  'Playfair Display',
  'JetBrains Mono',
];

export function googleFontsUrl(family: string): string | undefined {
  const known = GOOGLE_FAMILIES.find((f) => f.toLowerCase() === family.toLowerCase());
  return known ? `https://fonts.googleapis.com/css2?family=${known.replace(/ /g, '+')}:wght@400;500;600;700&display=swap` : undefined;
}
