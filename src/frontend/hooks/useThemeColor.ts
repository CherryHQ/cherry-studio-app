import type {
  CHERRY_PRODUCT_COLOR_TOKENS,
  SHADCN_PUBLIC_COLOR_TOKENS,
} from '@cherrystudio/design-tokens/contract';
import { useCSSVariable } from 'uniwind';

/**
 * Every name the theme contract declares as a colour, and nothing else.
 *
 * The parameter used to be `string`, which made this hook accept any name and
 * fail silently: it prefixes with `--color-`, so an unknown name resolves a
 * variable that does not exist and the caller receives the literal string
 * `'invalid'` as its colour. Nothing throws, nothing warns, and React Native
 * simply paints a missing colour. Three HeroUI bridge names (`separator`,
 * `default-foreground`, `background-secondary`) were passed here across six
 * call sites for as long as they existed, because the bridge declares them
 * bare in global.css rather than in the colour namespace.
 *
 * Deriving the parameter from the contract makes that a typecheck failure
 * instead. It also means retiring a token now surfaces every call site that
 * still wants it, rather than converting them to `'invalid'` at runtime.
 *
 * The import must stay type-only: the contract lives in the design-tokens
 * build scripts, and only `tsconfig.json` maps that specifier. `import type`
 * is erased, so neither Metro nor Jest ever resolves it.
 */
export type ThemeColorName =
  | (typeof CHERRY_PRODUCT_COLOR_TOKENS)[number]
  | (typeof SHADCN_PUBLIC_COLOR_TOKENS)[number];

type ColorTuple<T extends readonly ThemeColorName[]> = {
  [K in keyof T]: string;
};

export function useThemeColor(name: ThemeColorName): string;
export function useThemeColor<const T extends readonly ThemeColorName[]>(names: T): ColorTuple<T>;
export function useThemeColor(
  names: ThemeColorName | readonly ThemeColorName[],
): string | string[] {
  const isArray = Array.isArray(names);
  const colorNames = isArray ? names : [names];
  const values = useCSSVariable(colorNames.map((name) => `--color-${name}`));
  const resolved = values.map((value) => (typeof value === 'string' ? value : 'invalid'));

  return isArray ? resolved : (resolved[0] ?? 'invalid');
}
