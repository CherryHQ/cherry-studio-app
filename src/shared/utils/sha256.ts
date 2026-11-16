import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const HASH_CHUNK_BYTES = 64 * 1024;

/** Returns the lowercase hexadecimal SHA-256 digest of `data`. */
export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

/** Convenience for UTF-8 text. */
export function sha256HexOfText(text: string): string {
  return sha256Hex(new TextEncoder().encode(text));
}

/** Hashes chunks without concatenating them, yielding between bounded amounts of JS work. */
export async function sha256HexChunks(chunks: Iterable<Uint8Array>): Promise<string> {
  const hash = sha256.create();
  let processed = 0;
  for (const chunk of chunks) {
    for (let offset = 0; offset < chunk.byteLength;) {
      const end = Math.min(offset + HASH_CHUNK_BYTES - processed, chunk.byteLength);
      hash.update(chunk.subarray(offset, end));
      processed += end - offset;
      offset = end;
      if (processed === HASH_CHUNK_BYTES) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        processed = 0;
      }
    }
  }
  // Small files must also let input and rendering run between consecutive package digests.
  if (processed) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return bytesToHex(hash.digest());
}
