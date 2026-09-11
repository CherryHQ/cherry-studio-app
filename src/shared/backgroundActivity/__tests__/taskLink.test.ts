import { createBackgroundTaskUrl, parseBackgroundTaskUrl } from '../taskLink';

describe.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
  'background task links for the %s scheme',
  (scheme) => {
    test('chat and painting links round-trip, including ids that need encoding', () => {
      const chat = { agentId: 'agent/1', kind: 'chat', sessionId: 'session?2&3' } as const;
      const painting = { kind: 'painting', paintingId: 'painting #4/5' } as const;

      expect(parseBackgroundTaskUrl(createBackgroundTaskUrl(scheme, chat), scheme)).toEqual(chat);
      expect(parseBackgroundTaskUrl(createBackgroundTaskUrl(scheme, painting), scheme)).toEqual(
        painting,
      );
    });

    test('keeps the URL shapes that Live Activities and Expo Router already open', () => {
      expect(createBackgroundTaskUrl(scheme, { agentId: 'a', kind: 'chat', sessionId: 's' })).toBe(
        `${scheme}:///?agentId=a&sessionId=s`,
      );
      expect(createBackgroundTaskUrl(scheme, { kind: 'painting', paintingId: 'p' })).toBe(
        `${scheme}://paintings/p`,
      );
    });

    test('rejects other schemes, unknown routes, incomplete links, and malformed encoding', () => {
      expect(parseBackgroundTaskUrl('https://example.com/paintings/p', scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://settings`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://paintings/p/extra`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}:///?agentId=a`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}:///?agentId=&sessionId=s`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(`${scheme}://paintings/%E0%A4`, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(undefined, scheme)).toBeUndefined();
      expect(parseBackgroundTaskUrl(42, scheme)).toBeUndefined();
    });
  },
);
