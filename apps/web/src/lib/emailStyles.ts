import {DEFAULT_EMAIL_CSS} from '@plunk/shared';

// Detects if HTML contains custom patterns that indicate it was written in the HTML editor
// rather than the visual editor. Custom HTML should render as-is without prose wrapper.
//
// The TipTap editor in EmailEditor.tsx loads: StarterKit (paragraphs, headings, lists,
// blockquote, code, hr, bold, italic, strike, etc.), TextAlign, Color, TextStyle, Link,
// ResizableImage, and VariableMention. Of these, TextStyle + Color + Link natively
// round-trip <span style="color: ..."> / <a style="color: ..."> markup that TipTap itself
// generates when you change text color or style a link. We must therefore PERMIT what
// TipTap can represent and REJECT only what it can't.
export const detectCustomHtmlPatterns = (html: string): boolean => {
  if (!html || html.trim() === '') return false;

  const classMatches = html.matchAll(/class\s*=\s*["']([^"']*)["']/gi);
  let hasCustomClasses = false;
  for (const match of classMatches) {
    const classValue = match[1];
    if (!classValue) continue;

    const classes = classValue.split(/\s+/).filter(c => c.length > 0);
    const allowedPrefixes = [
      'prose',
      'variable-',
      'email-image',
      'ProseMirror',
      'resizable-image',
      'selected',
      'resize-handle',
    ];
    const hasDisallowedClass = classes.some(cls => !allowedPrefixes.some(prefix => cls.startsWith(prefix)));
    if (hasDisallowedClass) {
      hasCustomClasses = true;
      break;
    }
  }

  // Custom attributes that carry semantics TipTap doesn't preserve. We require an
  // attribute-boundary (whitespace, `=`, or quote) before the prefix so that query
  // strings like `?id=...` inside an `href="..."` value don't false-match.
  const hasCustomAttributes = /<[a-z][^>]*?[\s"'](?:data-|aria-|role=|id=)/i.test(html);

  // Elements TipTap cannot round-trip with the currently-loaded extension set.
  // - No Table/TableRow/TableCell extensions are loaded -> all table markup is custom.
  // - No Div/Section/etc. block-layout extensions -> reject layout containers.
  // - Form/embed/media/interactive elements have no TipTap representation here.
  // <span> is intentionally NOT in this list: TipTap's TextStyle extension emits and
  // accepts <span style="..."> for things like text color.
  const hasCustomElements =
    /<(?:div|section|article|header|footer|nav|aside|main|table|tr|td|th|tbody|thead|tfoot|colgroup|col|form|input|button|select|textarea|iframe|video|audio|svg|object|embed|details|summary|dialog)\b/i.test(
      html,
    );

  const hasMediaQueries = /@media/i.test(html);
  const hasStyleTags = /<style[^>]*>/i.test(html);

  return hasCustomClasses || hasCustomAttributes || hasCustomElements || hasMediaQueries || hasStyleTags;
};

export const wrapEmailWithStyles = (htmlBody: string, css = DEFAULT_EMAIL_CSS): string => {
  if (detectCustomHtmlPatterns(htmlBody)) {
    return htmlBody;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
${css}
  </style>
</head>
<body>
  <div class="prose prose-sm max-w-none">
    ${htmlBody}
  </div>
</body>
</html>`;
};
