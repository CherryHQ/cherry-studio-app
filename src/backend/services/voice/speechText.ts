// Up to and including sentence-ending punctuation; a period counts only before whitespace.
const SENTENCES = /.+?(?:[。！？!?；;…]+|\.(?=\s)|$)/gu;

/** Packs utterances at sentence boundaries when possible, with a separate first limit. */
export function splitSpeechText(
  text: string,
  maxLength: number,
  firstMaxLength = maxLength,
): string[] {
  if (!(maxLength >= 1 && firstMaxLength >= 1)) return [];
  const chunks: string[] = [];
  let limit = Math.floor(firstMaxLength);
  let chunk = '';
  const flush = () => {
    chunks.push(chunk);
    chunk = '';
    limit = Math.floor(maxLength);
  };

  for (const line of text.split('\n')) {
    let separator = chunk ? '\n' : '';
    for (const sentence of line.match(SENTENCES) ?? []) {
      // In Unicode mode this class matches only unpaired surrogates.
      const piece = sentence.trim().replace(/[\uD800-\uDFFF]/gu, '\uFFFD');
      let start = 0;
      while (start < piece.length) {
        if (chunk && chunk.length + separator.length + piece.length - start > limit) {
          flush();
          separator = '';
        }
        let end = Math.min(piece.length, start + limit - chunk.length - separator.length);
        const nextUnit = piece.charCodeAt(end);
        if (nextUnit >= 0xdc00 && nextUnit <= 0xdfff) end -= 1;
        if (end === start) {
          // A one-unit limit cannot hold a supplementary character.
          chunk += '\uFFFD';
          start += 2;
        } else {
          chunk += separator + piece.slice(start, end);
          start = end;
        }
        separator = ' ';
      }
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
