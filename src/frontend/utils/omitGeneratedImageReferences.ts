import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: false, linkify: false });

/** Omit only standalone duplicates of managed images already present in this message. */
export function omitGeneratedImageReferencesFromMarkdown(
  source: string,
  imageIds: ReadonlySet<string>,
): string {
  if (!imageIds.size || !source.includes('![') || ![...imageIds].some((id) => source.includes(id)))
    return source;
  const tokens = parser.parse(source, {});
  const lines = source.split('\n');
  const omittedLines = new Set<number>();
  for (const [index, token] of tokens.entries()) {
    // Only standalone images: keep code examples, nested blocks, and surrounding prose intact.
    if (
      token.type !== 'inline' ||
      token.level !== 1 ||
      tokens[index - 1]?.type !== 'paragraph_open' ||
      token.children?.length !== 1 ||
      !token.map
    )
      continue;
    const image = token.children[0];
    if (image.type !== 'image') continue;
    const url = image.attrGet('src');
    if (typeof url !== 'string') continue;
    // Models sometimes invent a preview URL from an opaque file id. Match only
    // the complete final path segment of an image already owned by this message.
    const id = url.split(/[?#]/, 1)[0]?.split('/').pop();
    if (!id || !imageIds.has(id)) continue;
    let [start, end] = token.map;
    while (end < lines.length && !lines[end].trim()) end += 1;
    for (; start < end; start += 1) omittedLines.add(start);
  }
  return omittedLines.size
    ? lines.filter((_, index) => !omittedLines.has(index)).join('\n')
    : source;
}
