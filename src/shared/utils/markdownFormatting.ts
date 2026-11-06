function stripProseFormatting(text: string): string {
  return text
    .replace(/!\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/gm, '')
    .replace(/<[^>]*>/g, '');
}

/** Strip prose markup without interpreting literal fenced or inline code as markup. */
export function stripMarkdownFormatting(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const codePattern =
    /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)(?:^ {0,3}\1[ \t]*(?=\n|$)|(?![\s\S]))|(`+)([\s\S]*?)\3(?!`)/gm;
  const parts: string[] = [];
  let offset = 0;
  for (const match of normalized.matchAll(codePattern)) {
    parts.push(stripProseFormatting(normalized.slice(offset, match.index)));
    parts.push(match[2] ?? match[4]);
    offset = match.index + match[0].length;
  }
  parts.push(stripProseFormatting(normalized.slice(offset)));
  return parts.join('');
}
