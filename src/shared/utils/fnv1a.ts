/**
 * FNV-1a 32-bit.
 *
 * Not cryptographic. Used for tool-name disambiguation and for transport change
 * detection — never for a security decision, and never as something to reverse.
 */
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}
