import type { Event } from '@sentry/react-native';

import {
  isExpectedSentryError,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
} from '../sentryEvent';

describe('Sentry event privacy', () => {
  test('retains symbolication fields while excluding content from every free-form field', () => {
    const privateContent = 'PRIVATE_CHAT_BODY_AND_PROVIDER_SECRET';
    const event: Event = {
      event_id: '0'.repeat(32),
      release: 'app@1.0.0',
      message: privateContent,
      user: { id: privateContent, email: `${privateContent}@example.com` },
      request: { url: `https://example.com/${privateContent}`, data: privateContent },
      contexts: { custom: { responseBody: privateContent } },
      extra: { cause: { prompt: privateContent }, componentStack: privateContent },
      breadcrumbs: [{ message: privateContent }],
      fingerprint: [privateContent],
      tags: { module: 'JobRuntime', operation: 'job.recover', sessionId: privateContent },
      exception: {
        values: [
          {
            type: 'TypeError',
            value: privateContent,
            mechanism: { type: 'onerror', handled: false, data: { response: privateContent } },
            stacktrace: {
              frames: [
                {
                  filename: `file:///private/${privateContent}/index.android.bundle?token=${privateContent}`,
                  abs_path: privateContent,
                  function: 'saveMessage',
                  lineno: 10,
                  colno: 20,
                  vars: { messages: privateContent },
                  context_line: privateContent,
                  pre_context: [privateContent],
                  post_context: [privateContent],
                },
              ],
            },
          },
        ],
      },
      debug_meta: {
        images: [
          {
            type: 'sourcemap',
            debug_id: 'debug-id',
            code_file: `file:///private/${privateContent}/index.android.bundle`,
          },
        ],
      },
    };

    const sanitized = sanitizeSentryEvent(event);
    expect(JSON.stringify(sanitized)).not.toContain(privateContent);
    expect(sanitized?.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual(
      expect.objectContaining({
        filename: 'app:///index.android.bundle',
        function: 'saveMessage',
        lineno: 10,
        colno: 20,
      }),
    );
    expect(sanitized?.debug_meta?.images?.[0]?.debug_id).toBe('debug-id');
    expect(sanitized?.tags).toEqual({
      'event.origin': 'javascript',
      module: 'JobRuntime',
      operation: 'job.recover',
    });
    expect(event.exception?.values?.[0]?.value).toBe(privateContent);
  });

  test('does not turn plain messages, cancellations, or dynamic operation text into reports', () => {
    expect(sanitizeSentryEvent({ message: 'a response body' })).toBeNull();
    expect(
      sanitizeSentryEvent({ exception: { values: [{ type: 'AbortError', value: 'canceled' }] } }),
    ).toBeNull();
    const event = sanitizeSentryEvent({
      exception: { values: [{ type: 'Error: secret', value: 'response body' }] },
      tags: { operation: 'request https://private.example.com', module: 'user@example.com' },
    });
    expect(event?.tags).toEqual({ 'event.origin': 'javascript' });
    expect(event?.exception?.values?.[0]?.type).toBe('Error');
    expect(
      isExpectedSentryError(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })),
    ).toBe(true);
    expect(isExpectedSentryError(new Error('database unavailable'))).toBe(false);
  });

  test('keeps only bounded, predefined breadcrumbs, rebuilding their contents', () => {
    const event = sanitizeSentryEvent({
      exception: { values: [{ type: 'Error' }] },
      breadcrumbs: [
        ...Array.from({ length: 25 }, (_, timestamp) => ({
          category: 'app.diagnostic',
          message: 'startup.router',
          timestamp,
          data: { token: 'private' },
          unknown: 'private',
        })),
        { category: 'navigation', message: '/chat/private' },
        { category: 'app.diagnostic', message: 'route.private' },
      ],
    });
    expect(event?.breadcrumbs).toHaveLength(20);
    expect(
      sanitizeSentryBreadcrumb({ category: 'app.diagnostic', message: 'route.settings' }),
    ).toBeNull();
    expect(
      sanitizeSentryBreadcrumb({ category: 'app.diagnostic', message: 'lifecycle.background' }),
    ).toBeNull();
    expect(event?.breadcrumbs?.[0]?.timestamp).toBe(5);
    expect(JSON.stringify(event)).not.toContain('private');
    expect(
      sanitizeSentryBreadcrumb({
        category: 'app.diagnostic',
        message: 'startup.ready',
        data: { url: 'private' },
      }),
    ).toEqual({
      category: 'app.diagnostic',
      message: 'startup.ready',
      level: 'info',
      timestamp: undefined,
    });
  });

  test('classifies framework failures and closed error codes without uploading free-form messages', () => {
    const event = {
      exception: {
        values: [{ type: 'Error', value: 'Element type is invalid: private component details' }],
      },
    };
    const sanitized = sanitizeSentryEvent(
      event,
      Object.assign(new Error('private'), { code: 'NOT_FOUND' }),
    );
    expect(sanitized?.tags).toMatchObject({
      'error.kind': 'invalid_element',
      'error.code': 'NOT_FOUND',
    });
    expect(JSON.stringify(sanitized)).not.toContain('private');
    expect(
      sanitizeSentryEvent(event, Object.assign(new Error(), { code: 'PRIVATE_SECRET' }))?.tags,
    ).not.toHaveProperty('error.code');
  });
});

describe('Sentry OTA source-map matching', () => {
  const runtime = globalThis as typeof globalThis & { _sentryDebugIds?: Record<string, string> };
  const originalDebugIds = runtime._sentryDebugIds;
  const otaDebugId = 'ab671690-420a-4f74-b664-a9619263183b';
  const nativeDebugId = '1a4cb2bb-ae99-4af1-ac49-4af95c4b62ae';

  beforeEach(() => {
    runtime._sentryDebugIds = { PRIVATE_PREMODULE_STACK_WITHOUT_A_PARSEABLE_FILENAME: otaDebugId };
  });

  afterEach(() => {
    if (originalDebugIds === undefined) delete runtime._sentryDebugIds;
    else runtime._sentryDebugIds = originalDebugIds;
  });

  function bundleError(filename: string): Event {
    return {
      release: 'com.cherryai.app@0.2.0+42',
      dist: '42',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'PRIVATE_CHAT_CONTENT',
            stacktrace: { frames: [{ filename, lineno: 1, colno: 12345 }] },
          },
        ],
      },
    };
  }

  test.each(['app:///index.android.bundle', 'app:///main.jsbundle'])(
    'fills a missing OTA debug ID and retains the matching frame filename: %s',
    (filename) => {
      const event = bundleError(filename);
      expect(sanitizeSentryEvent(event)?.debug_meta?.images).toEqual([
        { type: 'sourcemap', debug_id: otaDebugId, code_file: filename },
      ]);
      const nativeImage = {
        type: 'macho' as const,
        debug_id: nativeDebugId,
        image_addr: '0x100000000',
        image_size: 4096,
      };
      event.debug_meta = { images: [nativeImage] };

      const sanitized = sanitizeSentryEvent(event);
      expect(sanitized?.debug_meta?.images).toEqual([
        nativeImage,
        { type: 'sourcemap', debug_id: otaDebugId, code_file: filename },
      ]);
      expect(sanitized?.exception?.values?.[0]?.stacktrace?.frames?.[0]).toMatchObject({
        filename,
        lineno: 1,
        colno: 12345,
      });
      expect(sanitized).toMatchObject({ release: event.release, dist: event.dist });
      expect(JSON.stringify(sanitized)).not.toContain('PRIVATE_');
      expect(event.debug_meta.images).toEqual([nativeImage]);
      expect(sanitizeSentryEvent(sanitized!)).toEqual(sanitized);
    },
  );

  test.each(['app:///index.android.bundle', 'app:///main.jsbundle'])(
    'preserves the SDK match without adding another source map: %s',
    (filename) => {
      const event = bundleError(filename);
      const matchedImage = {
        type: 'sourcemap' as const,
        debug_id: nativeDebugId,
        code_file: filename,
      };
      event.debug_meta = { images: [matchedImage] };
      expect(sanitizeSentryEvent(event)?.debug_meta?.images).toEqual([matchedImage]);
    },
  );

  test.each<Record<string, string> | undefined>([
    undefined,
    {},
    { first: '' },
    { first: otaDebugId, second: nativeDebugId },
  ])(
    'does not invent a map when the injected bundle ID is missing or ambiguous: %j',
    (debugIds) => {
      runtime._sentryDebugIds = debugIds;
      expect(
        sanitizeSentryEvent(bundleError('app:///index.android.bundle'))?.debug_meta,
      ).toBeUndefined();
    },
  );

  test('does not attach the app bundle to native-only or unrelated stacks', () => {
    const event = bundleError('app:///index.android.bundle');
    event.exception!.values![0]!.stacktrace!.frames![0]!.platform = 'java';
    expect(sanitizeSentryEvent(event)?.debug_meta).toBeUndefined();
    expect(sanitizeSentryEvent(bundleError('app:///other.js'))?.debug_meta).toBeUndefined();
    expect(sanitizeSentryEvent({ type: 'transaction' })).toBeNull();
  });
});
