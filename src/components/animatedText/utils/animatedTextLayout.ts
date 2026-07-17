/** One character of a string with an identity that survives re-layout. */
export type GlyphIdentity = {
  char: string;
  id: string;
};

/**
 * Identity for every character in `value`: the character itself plus how many
 * of the same character precede it. Two strings that share "the 2nd e" agree
 * on its id, which is what lets a morph keep that glyph on screen and move it
 * instead of fading it out and back in.
 */
export function glyphIdentities(value: string): GlyphIdentity[] {
  const occurrences = new Map<string, number>();
  const identities: GlyphIdentity[] = [];

  for (const char of value) {
    const seen = occurrences.get(char) ?? 0;
    occurrences.set(char, seen + 1);
    identities.push({ char, id: `${char}:${seen}` });
  }

  return identities;
}

/** X where the first glyph starts, per alignment, given per-glyph advances. */
export function lineStartX(
  advances: readonly number[],
  width: number,
  align: 'left' | 'center',
): number {
  if (align === 'left') {
    return 0;
  }
  let total = 0;
  for (const advance of advances) {
    total += advance;
  }
  return (width - total) / 2;
}

/**
 * Stagger delay that ripples outward from the middle of the string, so a
 * morph blooms from the centre instead of sweeping left-to-right.
 */
export function rippleDelayMs(index: number, count: number, stepMs: number): number {
  if (count <= 1) {
    return 0;
  }
  const middle = (count - 1) / 2;
  return Math.round(Math.abs(index - middle) * stepMs);
}
