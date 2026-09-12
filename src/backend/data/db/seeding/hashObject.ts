/**
 * Compute a stable non-cryptographic hash of a JSON-serializable object.
 *
 * Desktop Cherry uses SHA-256 via Node crypto for seeder versions. The mobile
 * runtime should not depend on Node APIs, so this uses deterministic JSON plus
 * FNV-1a. The output is used by SeedRunner for change detection, not security.
 */
export function hashObject(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
