const mockSelectionAsync = jest.fn(async () => undefined);
const mockImpactAsync = jest.fn(async (_style?: unknown) => undefined);
const mockNotificationAsync = jest.fn(async (_type?: unknown) => undefined);

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
  NotificationFeedbackType: {
    Error: 'error',
    Success: 'success',
    Warning: 'warning',
  },
  impactAsync: (style: unknown) => mockImpactAsync(style),
  notificationAsync: (type: unknown) => mockNotificationAsync(type),
  selectionAsync: () => mockSelectionAsync(),
}));

import { Platform } from 'react-native';

import { haptics, triggerHaptic } from '../haptics';

describe('haptics', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    mockSelectionAsync.mockReset().mockResolvedValue(undefined);
    mockImpactAsync.mockReset().mockResolvedValue(undefined);
    mockNotificationAsync.mockReset().mockResolvedValue(undefined);
  });

  afterAll(() => {
    Platform.OS = originalOs;
  });

  it.each(['ios', 'android'] as const)('maps every semantic intent on %s', (platform) => {
    Platform.OS = platform;

    haptics.selection();
    haptics.light();
    haptics.medium();
    haptics.success();
    haptics.warning();
    haptics.error();
    triggerHaptic('light');

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenNthCalledWith(1, 'light');
    expect(mockImpactAsync).toHaveBeenNthCalledWith(2, 'medium');
    expect(mockImpactAsync).toHaveBeenNthCalledWith(3, 'light');
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(1, 'success');
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(2, 'warning');
    expect(mockNotificationAsync).toHaveBeenNthCalledWith(3, 'error');
  });

  it('no-ops cleanly on non-mobile platforms', () => {
    Platform.OS = 'web';

    haptics.selection();
    haptics.light();
    haptics.medium();
    haptics.success();
    haptics.warning();
    haptics.error();

    expect(mockSelectionAsync).not.toHaveBeenCalled();
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('swallows rejected promises and synchronous native errors', async () => {
    mockSelectionAsync.mockRejectedValueOnce(new Error('unavailable'));
    mockImpactAsync.mockImplementationOnce(() => {
      throw new Error('no vibrator');
    });

    expect(() => haptics.selection()).not.toThrow();
    expect(() => haptics.light()).not.toThrow();

    await Promise.resolve();
  });
});
