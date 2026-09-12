/**
 * Deep equality over JSON-safe values (primitives, plain objects, arrays).
 *
 * Replaces the desktop's `es-toolkit/compat` `isEqual` for the cache's
 * same-value write guards. Structural comparison applies ONLY to arrays and
 * plain objects; any other object (Date, Map, Set, class instances, ...)
 * compares unequal unless reference-identical. Cache values are constrained
 * to JSON-serializable shapes, so for exotic types the safe failure mode is
 * "not equal" — a redundant notify beats a swallowed update.
 */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => deepEqual(item, right[index]));
  }

  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
