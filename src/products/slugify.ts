/** "Mont Acrylic Colour (Red)" -> "mont-acrylic-colour-red". Bangla letters are kept. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'item'
  );
}
