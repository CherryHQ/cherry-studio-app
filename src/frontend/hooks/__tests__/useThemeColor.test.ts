import { useThemeColor } from '../useThemeColor';

/**
 * A type-level guard, not a behaviour test. Neither wrapper is ever called —
 * they exist so `tsc` checks the call expression inside them, and
 * `@ts-expect-error` fails `pnpm typecheck:app` if the error stops occurring.
 * Widening the parameter back to `string` therefore breaks this file rather
 * than going unnoticed until a screen paints `'invalid'`. They are named
 * `use*` because a function that calls a hook is one, by React's rules.
 */
describe('useThemeColor', () => {
  test('rejects names the theme contract does not declare', () => {
    const useBridgeName = () =>
      // @ts-expect-error `separator` is a HeroUI bridge name declared bare in
      // global.css, so `--color-separator` does not exist and the hook would
      // hand back the literal string `'invalid'`.
      useThemeColor('separator');
    const useBridgeNameTuple = () =>
      // @ts-expect-error Same for the tuple overload, which is how three of the
      // six original call sites were written.
      useThemeColor(['background-secondary', 'default-foreground']);

    expect(useBridgeName).toBeInstanceOf(Function);
    expect(useBridgeNameTuple).toBeInstanceOf(Function);
  });
});
