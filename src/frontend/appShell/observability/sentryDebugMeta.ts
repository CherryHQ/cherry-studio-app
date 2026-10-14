import type { Event } from '@sentry/react-native';
import { Platform } from 'react-native';

const BUNDLE_NAME =
  Platform.OS === 'android'
    ? 'app:///index.android.bundle'
    : Platform.OS === 'ios'
      ? 'app:///main.jsbundle'
      : undefined;

/**
 * Backport of SDK 8's `debugMetaIntegration` (getsentry/sentry-react-native#6545) for SDK 7.11.
 * Core's filename match misses Hermes premodule stacks, so OTA errors lose their source map and fall
 * back to the native build's map. Replace with `Sentry.debugMetaIntegration()` after upgrading.
 */
export function debugMetaIntegration() {
  return { name: 'DebugMeta', processEvent };
}

function processEvent(event: Event): Event {
  // Core stamps `debug_meta` itself after event processors when it matched a frame.
  if (
    event.type !== undefined ||
    event.exception?.values?.some((error) =>
      error.stacktrace?.frames?.some((frame) => frame.debug_id !== undefined),
    )
  )
    return event;

  const debugIds = Object.values(
    (globalThis as typeof globalThis & { _sentryDebugIds?: Record<string, string> })
      ._sentryDebugIds ?? {},
  );
  // Like the SDK, never guess which of several registered bundles produced this stack.
  const debugId = debugIds.length === 1 ? debugIds[0] : undefined;
  if (!BUNDLE_NAME || !debugId) return event;

  const images = event.debug_meta?.images ?? [];
  if (images.some((image) => 'debug_id' in image && image.debug_id === debugId)) return event;
  event.debug_meta = {
    ...event.debug_meta,
    images: [...images, { type: 'sourcemap', debug_id: debugId, code_file: BUNDLE_NAME }],
  };
  return event;
}
