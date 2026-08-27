/**
 * Splits a raw query into the keywords a match has to contain.
 *
 * Whitespace separates keywords instead of belonging to one, so `gpt 4o` finds
 * a model named `GPT-4o` the way a single substring never would, and the order
 * the words were typed in stops mattering.
 */
export function toSearchKeywords(raw: string): string[] {
  return raw
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

/**
 * True when every keyword appears somewhere across the given fields.
 *
 * The fields are joined into one haystack rather than tested individually, so a
 * query can span them — `qwen vision` matches an item whose name carries one
 * word and whose description carries the other. No keywords means no filter.
 */
export function matchesSearchKeywords(
  keywords: readonly string[],
  fields: readonly (string | null | undefined)[],
): boolean {
  if (keywords.length === 0) {
    return true;
  }

  const haystack = fields.filter(Boolean).join(' ').toLocaleLowerCase();

  return keywords.every((keyword) => haystack.includes(keyword));
}
