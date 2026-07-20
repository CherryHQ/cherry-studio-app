/**
 * Deep equality over JSON-safe values (primitives, plain objects, arrays).
 *
 * Replaces the desktop's `es-toolkit/compat` `isEqual` for the cache's
 * same-value write guards. Cache values are constrained to JSON-serializable
 * shapes, so Map/Set/Date/class instances are deliberately unsupported and
 * compare unequal unless reference-identical.
 */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isComparableObject(left) || !isComparableObject(right)) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => deepEqual(item, right[index]));
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] &&
      deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

function isComparableObject(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}
