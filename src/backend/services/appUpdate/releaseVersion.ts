/** Current APK releases and expo.version use numeric versions. */
export function compareReleaseVersions(left: string, right: string): number {
  const parse = (value: string) => {
    if (!/^\d+(?:\.\d+){0,3}$/.test(value)) {
      throw new Error('Invalid release version');
    }
    const parts = value.split('.').map(Number);
    if (parts.some((part) => !Number.isSafeInteger(part))) {
      throw new Error('Invalid release version');
    }
    return parts;
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
