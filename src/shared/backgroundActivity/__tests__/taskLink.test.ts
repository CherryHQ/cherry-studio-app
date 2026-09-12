import { createBackgroundTaskUrl, isSameBackgroundTask, parseBackgroundTaskUrl } from '../taskLink';

describe.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
  'background task links for the %s scheme',
  (scheme) => {
    test('chat and painting links round-trip, including ids that need encoding', () => {
      const chat = { kind: 'chat', sessionId: 'session?2&3' } as const;
      const painting = { kind: 'painting', paintingId: 'painting #4/5' } as const;

      expect(parseBackgroundTaskUrl(createBackgroundTaskUrl(scheme, chat), scheme)).toEqual(chat);
      expect(parseBackgroundTaskUrl(createBackgroundTaskUrl(scheme, painting), scheme)).toEqual(
        painting,
      );
    });

    test('opens the task surfaces without requiring a redundant agent or generated image id', () => {
      expect(createBackgroundTaskUrl(scheme, { kind: 'chat', sessionId: 's' })).toBe(
        `${scheme}:///?sessionId=s`,
      );
      expect(createBackgroundTaskUrl(scheme, { kind: 'painting', paintingId: 'p' })).toBe(
        `${scheme}://paintings?paintingId=p`,
      );
    });

    test('accepts notifications delivered by previous app versions', () => {
      expect(parseBackgroundTaskUrl(`${scheme}:///?agentId=a&sessionId=s`, scheme)).toEqual({
        kind: 'chat',
        sessionId: 's',
      });
      expect(parseBackgroundTaskUrl(`${scheme}://paintings/p`, scheme)).toEqual({
        kind: 'painting',
        paintingId: 'p',
      });
    });

    test('rejects other schemes, unknown routes, incomplete links, and malformed encoding', () => {
      expect(parseBackgroundTaskUrl('https://example.com/paintings/p', scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://settings`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://paintings/p/extra`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}:///?agentId=a`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}:///?sessionId=`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://paintings?paintingId=`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://paintings/%E0%A4`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(undefined, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(42, scheme)).toBeUndefined();
    });
  },
);

test('notification identity includes the task kind and compares decoded ids', () => {
  const chat = { kind: 'chat', sessionId: 'same' } as const;
  expect(isSameBackgroundTask(chat, { ...chat })).toBe(true);
  expect(isSameBackgroundTask(chat, { kind: 'painting', paintingId: 'same' })).toBe(false);
  expect(isSameBackgroundTask(chat, { kind: 'chat', sessionId: 'other' })).toBe(false);
  expect(isSameBackgroundTask(undefined, undefined)).toBe(false);
});
