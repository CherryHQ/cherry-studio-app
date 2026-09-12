import { Observe } from 'expo-observe';

/**
 * Turns on EAS Observe's Expo Router integration.
 *
 * Without this call the SDK still records session and error data, but the
 * `expo-router` integration stays off (`integrations` defaults to `false` for
 * every entry), so no `cold_ttr` / `warm_ttr` / `tti` metric ever carries a
 * route name. The integration installs a `pageFocused` listener the first time
 * it initializes, and `useObserve()` asserts the flag never flips during a
 * screen's lifecycle, which is why this has to run at module scope in the root
 * layout rather than inside an effect.
 *
 * Everything else is left at the SDK defaults on purpose: debug builds do not
 * dispatch (`dispatchInDebug: false`), so a development client running against
 * Metro never pollutes production metrics, and `environment` follows
 * `process.env.NODE_ENV` — the only build-time signal that survives into the
 * bundle here, since EAS `env.PROFILE` lacks the `EXPO_PUBLIC_` prefix Babel
 * inlines.
 */
export function configureObserve() {
  Observe.configure({ integrations: { 'expo-router': true } });
}
