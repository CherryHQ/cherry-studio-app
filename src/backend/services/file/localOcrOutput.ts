export function extractOcrFormulas(text: string): string[] {
  const formulas: string[] = [];
  for (const match of text.matchAll(
    /\$\$([^]*?)\$\$|\\\[([^]*?)\\\]|\\\(([^]*?)\\\)|(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/g,
  )) {
    const formula = (match[1] ?? match[2] ?? match[3] ?? match[4])?.trim();
    if (formula) formulas.push(formula);
  }
  return formulas;
}

/** Field values stay strings: parsing must not erase leading zeroes, units or decimal notation. */
export function parseOcrFields(
  raw: string,
  fields: readonly string[],
): Record<string, string | null> | undefined {
  try {
    const value: unknown = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```$/, ''),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some((key) => !fields.includes(key))) return undefined;
    if (
      fields.some(
        (field) =>
          !Object.hasOwn(object, field) ||
          (object[field] !== null && typeof object[field] !== 'string'),
      )
    )
      return undefined;
    return Object.fromEntries(
      fields.map((field) => [
        field,
        object[field] === '' ? null : (object[field] as string | null),
      ]),
    );
  } catch {
    return undefined;
  }
}
