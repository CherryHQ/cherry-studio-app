import { useCSSVariable } from 'uniwind';

type ColorTuple<T extends readonly string[]> = {
  [K in keyof T]: string;
};

export function useThemeColor(name: string): string;
export function useThemeColor<const T extends readonly string[]>(names: T): ColorTuple<T>;
export function useThemeColor(names: string | readonly string[]): string | string[] {
  const isArray = Array.isArray(names);
  const colorNames = isArray ? names : [names];
  const values = useCSSVariable(colorNames.map((name) => `--color-${name}`));
  const resolved = values.map((value) => (typeof value === 'string' ? value : 'invalid'));

  return isArray ? resolved : (resolved[0] ?? 'invalid');
}
