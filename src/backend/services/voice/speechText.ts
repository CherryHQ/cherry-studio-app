import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: false, linkify: false });

// Closing a block ends a spoken line; table cells only need a gap between them.
const LINE_ENDS = new Set([
  'paragraph_close',
  'heading_close',
  'list_item_close',
  'blockquote_close',
  'tr_close',
]);
const CELL_ENDS = new Set(['th_close', 'td_close']);

/** The prose a listener needs from Markdown: code blocks, images and link targets are skipped. */
export function speakableText(markdown: string): string {
  const lines: string[] = [];
  let line = '';
  const endLine = () => {
    const text = line.replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
    line = '';
  };
  for (const token of parser.parse(markdown, {})) {
    if (token.type === 'inline') {
      for (const child of token.children ?? []) {
        if (child.type === 'text' || child.type === 'code_inline') line += child.content;
        else if (child.type === 'softbreak' || child.type === 'hardbreak') line += ' ';
      }
    } else if (CELL_ENDS.has(token.type)) {
      line += ' ';
    } else if (LINE_ENDS.has(token.type) || token.type === 'fence' || token.type === 'code_block') {
      endLine();
    }
  }
  endLine();
  return lines.join('\n');
}

// Up to and including sentence-ending punctuation; a period counts only before whitespace.
const SENTENCES = /.+?(?:[。！？!?；;…]+|\.(?=\s)|$)/gu;

/**
 * Packs text into utterances of at most `maxLength`, breaking at sentences where possible.
 */
export function splitSpeechText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const line of text.split('\n')) {
    let separator = chunk ? '\n' : '';
    for (const sentence of line.match(SENTENCES) ?? []) {
      let piece = sentence.trim();
      while (piece) {
        if (chunk && chunk.length + separator.length + piece.length > maxLength) {
          chunks.push(chunk);
          chunk = '';
          separator = '';
        }
        const part = piece.slice(0, maxLength - chunk.length - separator.length);
        chunk += separator + part;
        separator = ' ';
        piece = piece.slice(part.length);
      }
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
