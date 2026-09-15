import type { Event } from '@sentry/react-native';

import { isExpectedSentryError, sanitizeSentryEvent } from '../sentryEvent';

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
});
