/**
 * Expo entry point.
 *
 * Storybook and the app each register their own root component, so exactly one
 * of them may be imported — a static import of both would register twice, which
 * is why this branches on `require` rather than rendering a component.
 *
 * The flag needs the `EXPO_PUBLIC_` prefix to survive into the bundle: Babel
 * inlines only that prefix. A bare `STORYBOOK_ENABLED` reaches Metro (a Node
 * process) but never the app, which is how `.rnstorybook` sat unreachable —
 * `metro.config.js` reads the same name so the two halves cannot drift apart.
 */
if (process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- import would hoist
  require('./.rnstorybook');
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- import would hoist
  require('expo-router/entry');
}
