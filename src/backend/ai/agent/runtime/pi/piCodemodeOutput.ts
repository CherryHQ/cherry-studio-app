import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

// A UTF-16 code unit needs at most three UTF-8 bytes, so this many always fit.
const MAX_CHARACTERS = Math.floor(MAX_TEXT_ATTACHMENT_BYTES / 3);

/**
 * read_file refuses a source over its full-source limit, so a saved text output keeps only the
 * start it can read back. The model already holds the output's start and end in the tool result.
 */
export function fitPiCodemodeOutput(data: string | Uint8Array): string | Uint8Array {
  if (
    typeof data !== 'string' ||
    data.length <= MAX_CHARACTERS ||
    new TextEncoder().encode(data).byteLength <= MAX_TEXT_ATTACHMENT_BYTES
  )
    return data;
  // Room for the note; the count it states is what the file keeps.
  let end = MAX_CHARACTERS - 120;
  const last = data.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return `${data.slice(0, end)}\n[Saved output cut: the first ${end} of ${data.length} characters are kept.]`;
}
