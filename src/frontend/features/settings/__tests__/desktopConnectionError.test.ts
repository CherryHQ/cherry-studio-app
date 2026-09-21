import type { TFunction } from 'i18next';

import { ErrorCode, DataApiError } from '@/shared/data/api/errors';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';

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
