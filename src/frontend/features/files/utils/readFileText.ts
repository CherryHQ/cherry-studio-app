import { File, FileMode } from 'expo-file-system';

/** Display budget, independent of the producer or the size of an imported file. */
export const FILE_VIEWER_MAX_BYTES = 1024 * 1024;

export type FileText = { isTruncated: boolean; text: string };

export function decodeFileText(bytes: Uint8Array): FileText {
  const isTruncated = bytes.length > FILE_VIEWER_MAX_BYTES;
  const head = bytes.subarray(0, FILE_VIEWER_MAX_BYTES);
  if (head.includes(0)) throw new Error('Binary content cannot be displayed as text');
  // Streaming decode drops only a final incomplete UTF-8 sequence when truncated.
  // The decoder strips a BOM and replaces malformed sequences elsewhere.
  const text = new TextDecoder().decode(head, { stream: isTruncated });
  return { isTruncated, text };
}

/** Read one extra byte to detect truncation without loading the whole file. */
export function readFileText(uri: string): FileText {
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    return decodeFileText(handle.readBytes(FILE_VIEWER_MAX_BYTES + 1));
  } finally {
    handle.close();
  }
}
