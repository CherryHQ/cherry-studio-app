import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Returns the lowercase hexadecimal SHA-256 digest of `data`. */
export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

/** Convenience for UTF-8 text. */
export function sha256HexOfText(text: string): string {
  return sha256Hex(new TextEncoder().encode(text));
}
