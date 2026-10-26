import { createInstance, type TFunction } from 'i18next';

import en from '@/frontend/i18n/locales/en-us.json';
import { ErrorCode, DataApiError } from '@/shared/data/api/errors';

import {
  desktopConnectionErrorMessage,
  isMissingPairingConnection,
} from '../desktopConnectionError';

const mockPlatformState = { os: 'ios' };

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformState.os;
    },
  },
}));

const TRANSLATIONS: Record<string, string> = {
  'settings.desktopConnection.error.pairing-rejected':
    'The pairing code is invalid, expired, or already used.',
  'settings.desktopConnection.error.unknown': 'The operation failed. Try again.',
  'settings.desktopConnection.error.connection-not-found':
    'This saved connection is no longer available. Scan a new pairing code to connect again.',
  'settings.desktopConnection.error.unreachable':
    'Could not connect to the PC. Make sure both devices are on the same local network.',
  'settings.desktopConnection.error.unreachable.ios':
    'Could not connect to the PC. Check that the devices can reach each other, and make sure Cherry Studio is allowed under Settings › Privacy & Security › Local Network.',
};
const t = ((key: string) => TRANSLATIONS[key] ?? key) as unknown as TFunction;

const unreachable = () =>
  new DataApiError(ErrorCode.INVALID_OPERATION, 'failed', { reason: 'unreachable' });

describe('desktopConnectionErrorMessage', () => {
  afterEach(() => {
    mockPlatformState.os = 'ios';
  });

  it('offers a new pairing for a missing saved connection', () => {
    const error = new DataApiError(ErrorCode.NOT_FOUND, 'missing', {
      reason: 'connection-not-found',
    });
    expect(isMissingPairingConnection(error)).toBe(true);
    expect(desktopConnectionErrorMessage(error, t)).toBe(
      TRANSLATIONS['settings.desktopConnection.error.connection-not-found'],
    );
    expect(isMissingPairingConnection(new DataApiError(ErrorCode.NOT_FOUND, 'unrelated'))).toBe(
      false,
    );
  });

  it('points iOS users at the Local Network permission for unreachable errors', () => {
    expect(desktopConnectionErrorMessage(unreachable(), t)).toBe(
      TRANSLATIONS['settings.desktopConnection.error.unreachable.ios'],
    );
  });

  it('keeps the generic network hint on non-iOS platforms', () => {
    mockPlatformState.os = 'android';
    expect(desktopConnectionErrorMessage(unreachable(), t)).toBe(
      TRANSLATIONS['settings.desktopConnection.error.unreachable'],
    );
  });

  it('does not reroute other reasons to the Local Network hint', () => {
    const error = new DataApiError(ErrorCode.INVALID_OPERATION, 'failed', {
      reason: 'pairing-rejected',
    });
    expect(desktopConnectionErrorMessage(error, t)).toBe(
      TRANSLATIONS['settings.desktopConnection.error.pairing-rejected'],
    );
  });

  it('falls back to the unknown message for non-DataApiError values', () => {
    expect(desktopConnectionErrorMessage(new Error('boom'), t)).toBe(
      TRANSLATIONS['settings.desktopConnection.error.unknown'],
    );
  });
});

describe('WebSocket opening feedback', () => {
  const i18n = createInstance();
  beforeAll(async () => {
    await i18n.init({ lng: 'en', resources: { en: { translation: en } }, keySeparator: false });
  });
  function failure(kind: 'timeout' | 'websocket', message?: string) {
    return new DataApiError(ErrorCode.INVALID_OPERATION, 'failed', {
      reason: 'unreachable',
      connectionFailures: [
        {
          address: 'wss://desktop.example.com:443/v1/remote/connect',
          kind,
          closeCode: 1006,
          message,
        },
      ],
    });
  }
  it.each([
    ["Expected HTTP 101 response but was '403 Forbidden'", 'HTTP 403', 'access'],
    ['Received bad response code from server: 503.', 'HTTP 503', 'unavailable'],
    ["Expected HTTP 101 response but was '200 OK'", 'HTTP 200', 'WebSocket'],
  ])('explains an explicit native HTTP rejection: %s', (native, status, hint) => {
    const message = desktopConnectionErrorMessage(failure('websocket', native), i18n.t);
    expect(message).toContain(status);
    expect(message).toContain(hint);
    expect(message).toContain('desktop.example.com:443');
  });
  it('does not call an opaque 1006 failure an unsupported WebSocket server', () => {
    const message = desktopConnectionErrorMessage(failure('websocket'), i18n.t);
    expect(message).toContain('Could not connect to the PC');
    expect(message).toContain('WebSocket 1006');
    expect(message).not.toContain('HTTP 1006');
    expect(message).not.toContain('did not accept');
  });
  it('shows a native certificate failure without inventing an HTTP status', () => {
    const message = desktopConnectionErrorMessage(
      failure('websocket', 'Certificate verification failed'),
      i18n.t,
    );
    expect(message).toContain('Certificate verification failed');
    expect(message).not.toContain('HTTP ');
  });
  it('keeps different endpoint failures separate', () => {
    const error = new DataApiError(ErrorCode.INVALID_OPERATION, 'failed', {
      reason: 'unreachable',
      connectionFailures: [
        {
          address: 'wss://first.example.com:443/v1/remote/connect',
          kind: 'websocket',
          message: "Expected HTTP 101 response but was '404 Not Found'",
        },
        { address: 'ws://second.example.com:23333/v1/remote/connect', kind: 'timeout' },
      ],
    });
    const message = desktopConnectionErrorMessage(error, i18n.t);
    expect(message).toContain('first.example.com:443');
    expect(message).toContain('HTTP 404');
    expect(message).toContain('second.example.com:23333');
    expect(message).toContain('timed out');
  });
  it('preserves protocol incompatibility even after an earlier address failed', () => {
    const error = new DataApiError(ErrorCode.INVALID_OPERATION, 'failed', {
      reason: 'unsupported-version',
      connectionFailures: [{ address: 'ws://desktop:80', kind: 'timeout' }],
    });
    expect(desktopConnectionErrorMessage(error, i18n.t)).toBe(
      'This PC configuration protocol version is not supported.',
    );
  });
  it('distinguishes a silent server from a rejected handshake', () => {
    expect(desktopConnectionErrorMessage(failure('timeout'), i18n.t)).toContain('timed out');
  });
});
