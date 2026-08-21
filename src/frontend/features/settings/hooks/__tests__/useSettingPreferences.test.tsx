import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ThemeMode } from '@/shared/data/preference';

import { useSettingPreferences } from '../useSettingPreferences';

type SettingPreferences = ReturnType<typeof useSettingPreferences>;

const mockApplyThemeMode = jest.fn();
const mockAlertShow = jest.fn();
const mockWithThemeTransition = jest.fn((applyTheme: () => void, _config: unknown) => applyTheme());
const mockSetPreferences = jest.fn(async () => undefined);

let mockPreferences: { language: string; themeMode: ThemeMode };

jest.mock('@/frontend/data/hooks', () => ({
  useMultiplePreferences: () => [mockPreferences, mockSetPreferences],
}));

jest.mock('@/frontend/utils/theme', () => ({
  applyThemeModePreference: (themeMode: unknown) => mockApplyThemeMode(themeMode),
}));

jest.mock('@/frontend/i18n', () => ({
  initI18n: jest.fn(),
  resolveLanguage: (language: string) => language,
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Overrides the inline stub in jest.setup.ts so the config handed to the native side
// can be asserted. Still runs the callback synchronously — that is the contract the
// library documents, and the reason the theme swap had to stop awaiting the write.
jest.mock('react-native-nitro-theme-transition', () => ({
  withThemeTransition: (applyTheme: () => void, config: unknown) =>
    mockWithThemeTransition(applyTheme, config),
}));

describe('useSettingPreferences', () => {
  let renderer: ReactTestRenderer | undefined;
  let preferences: SettingPreferences | undefined;

  function Probe() {
    preferences = useSettingPreferences();
    return null;
  }

  function mount() {
    act(() => {
      renderer = create(<Probe />);
    });

    return current();
  }

  // The store pushes preference writes back through a subscription, so a committed
  // write re-renders this hook with the new mode.
  function pushThemeMode(themeMode: ThemeMode) {
    mockPreferences = { ...mockPreferences, themeMode };
    act(() => {
      renderer?.update(<Probe />);
    });
  }

  function current() {
    if (!preferences) {
      throw new Error('Setting preferences were not rendered.');
    }

    return preferences;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferences = { language: 'en-US', themeMode: ThemeMode.light };
    mockSetPreferences.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    preferences = undefined;
  });

  test('applies the theme synchronously, before the write is even issued', () => {
    const settings = mount();

    act(() => settings.theme.onValueChange(ThemeMode.dark));

    // No await anywhere above: the whole point of the change is that the theme is
    // live by the time the handler returns, rather than one SQLite round trip later.
    expect(mockApplyThemeMode).toHaveBeenCalledWith(ThemeMode.dark);
    expect(mockApplyThemeMode.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetPreferences.mock.invocationCallOrder[0] as number,
    );
    expect(mockSetPreferences).toHaveBeenCalledWith(
      { themeMode: ThemeMode.dark },
      { optimistic: true },
    );
  });

  test('swaps the theme inside the transition callback, not around it', () => {
    // Holding the callback instead of running it is the only way to tell "swapped
    // inside the transition" apart from "swapped next to it". The library invokes it
    // while a snapshot of the old screen covers the app, so a swap on either side of
    // that window reads as a jump rather than a fade.
    mockWithThemeTransition.mockImplementationOnce(() => undefined);
    const settings = mount();

    act(() => settings.theme.onValueChange(ThemeMode.dark));

    expect(mockApplyThemeMode).not.toHaveBeenCalled();

    act(() => mockWithThemeTransition.mock.calls[0]?.[0]());

    expect(mockApplyThemeMode).toHaveBeenCalledWith(ThemeMode.dark);
  });

  test('ignores a tap on the mode that is already selected', () => {
    const settings = mount();

    act(() => settings.theme.onValueChange(ThemeMode.light));

    // `getChangedKeys` would drop the write anyway, but only after a fade had
    // already played over an unchanged screen.
    expect(mockWithThemeTransition).not.toHaveBeenCalled();
    expect(mockApplyThemeMode).not.toHaveBeenCalled();
    expect(mockSetPreferences).not.toHaveBeenCalled();
  });

  test('restores the previous mode when the write fails', async () => {
    mockSetPreferences.mockRejectedValueOnce(new Error('write failed'));
    const settings = mount();

    await act(async () => {
      settings.theme.onValueChange(ThemeMode.dark);
    });

    expect(mockApplyThemeMode.mock.calls).toEqual([[ThemeMode.dark], [ThemeMode.light]]);
    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'settings.appearance.saveFailed' });
    // The rollback is deliberately not animated: a failed write should not read as
    // another polished crossfade.
    expect(mockWithThemeTransition).toHaveBeenCalledTimes(1);
  });

  test('does not roll back when a newer change has already superseded the failure', async () => {
    let rejectFirstWrite: ((error: Error) => void) | undefined;
    mockSetPreferences.mockReturnValueOnce(
      new Promise<undefined>((_resolve, reject) => {
        rejectFirstWrite = reject;
      }),
    );

    const settings = mount();

    act(() => settings.theme.onValueChange(ThemeMode.dark));
    pushThemeMode(ThemeMode.dark);
    act(() => current().theme.onValueChange(ThemeMode.system));

    await act(async () => {
      rejectFirstWrite?.(new Error('write failed'));
    });

    // The stale failure must not drag the app back to light after the user has
    // already moved on to system.
    expect(mockApplyThemeMode.mock.calls).toEqual([[ThemeMode.dark], [ThemeMode.system]]);
    expect(mockAlertShow).not.toHaveBeenCalled();
  });
});
