const mockSelectionAsync = jest.fn(async () => undefined);
const mockImpactAsync = jest.fn(async (_style?: unknown) => undefined);
const mockNotificationAsync = jest.fn(async (_type?: unknown) => undefined);
const mockAndroidHaptics = jest.fn(async (_effect: string) => undefined);

jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  impactAsync: (style: unknown) => mockImpactAsync(style),
  notificationAsync: (type: unknown) => mockNotificationAsync(type),
  performAndroidHapticsAsync: (effect: string) => mockAndroidHaptics(effect),
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
    mockAndroidHaptics.mockClear();
  });

  afterAll(() => {
    Platform.OS = originalOs;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps every semantic intent on iOS', () => {
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

  it.each([
    [26, ['clock-tick', 'virtual-key', 'context-click']],
    [30, ['clock-tick', 'virtual-key', 'context-click', 'confirm', 'reject', 'reject']],
    [34, ['segment-tick', 'virtual-key', 'context-click', 'confirm', 'reject', 'reject']],
  ] as const)('uses only supported system touch effects on Android API %i', (version, expected) => {
    Platform.OS = 'android';
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
    haptics.selection();
    haptics.light();
    haptics.medium();
    haptics.success();
    haptics.warning();
    haptics.error();
    expect(mockAndroidHaptics.mock.calls.map(([effect]) => effect)).toEqual(expected);
    expect(mockSelectionAsync).not.toHaveBeenCalled();
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
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
