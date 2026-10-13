import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import type { RuntimeArtifact } from '../types';

/** Keep every generated text source within read_file's full-source limit. */
export async function writePiCodemodeOutput(
  name: string,
  data: string | Uint8Array,
  write: (name: string, data: string | Uint8Array) => Promise<RuntimeArtifact>,
): Promise<RuntimeArtifact> {
  // A UTF-16 code unit needs at most three UTF-8 bytes; paired surrogates need fewer.
  const chunkCharacters = Math.floor(MAX_TEXT_ATTACHMENT_BYTES / 3);
  if (
    typeof data !== 'string' ||
    data.length <= chunkCharacters ||
    new TextEncoder().encode(data).byteLength <= MAX_TEXT_ATTACHMENT_BYTES
  )
    return write(name, data);

  const parts: RuntimeArtifact[] = [];
  for (let start = 0; start < data.length;) {
    let end = Math.min(start + chunkCharacters, data.length);
    const last = data.charCodeAt(end - 1);
    const next = data.charCodeAt(end);
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
    parts.push(await write(`${name}.part-${parts.length + 1}.txt`, data.slice(start, end)));
    start = end;
  }
  return write(
    `${name}.index.txt`,
    [
      'Full output is split into the following files in order, with no content omitted.',
      'Use read_file with each file_entry_id and offset/max_characters to page through it.',
      'Concatenate the contents in order without inserting separators.',
      ...parts.map(
        (part, index) => `${index + 1}. ${part.name}: file_entry_id=${part.ref.fileEntryId}`,
      ),
    ].join('\n'),
  );
}
