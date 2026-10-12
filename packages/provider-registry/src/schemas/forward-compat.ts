import * as z from 'zod';

/** Keep recognized values or entries without rejecting the entire remote catalog. */
export function looseArray<T extends z.ZodType>(
  item: T,
  { min }: { min?: number } = {},
): z.ZodType<z.output<T>[]> {
  const array = z.array(z.unknown()).transform((values) =>
    values.reduce<z.output<T>[]>((kept, value) => {
      const parsed = item.safeParse(value);
      if (parsed.success) kept.push(parsed.data);
      return kept;
    }, []),
  );
  return min === undefined
    ? array
    : array.refine((values) => values.length >= min, {
        message: `expected at least ${min} recognized value(s)`,
      });
}
