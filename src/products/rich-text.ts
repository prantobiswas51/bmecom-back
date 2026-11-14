import sanitizeHtml from 'sanitize-html';

/**
 * The only markup a rich text field may keep. Scripts, styles and event handlers are always dropped.
 * Photos (`images: true`) are allowed for blog posts only, and only from http(s) or this site's own paths.
 */
export function cleanRichText(html: string | null | undefined, options: { images?: boolean } = {}): string | null {
  if (html == null) return null;
  const clean = sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
      ...(options.images ? ['img'] : []),
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // A photo whose address was rejected would leave an empty image tag behind.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
  }).trim();
  return clean === '' ? null : clean;
}
