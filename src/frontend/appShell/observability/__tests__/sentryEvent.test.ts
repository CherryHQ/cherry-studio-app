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
