import { useEffect, type MutableRefObject } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useProviderApiServiceSheetClose } from '../useProviderApiServiceSheetClose';

type HookResult = ReturnType<typeof useProviderApiServiceSheetClose>;

const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockReplace = jest.fn();
const mockAlertConfirm = jest.fn();
const mockDisablePrevention = jest.fn();
const mockUsePreventRemove = jest.fn(
  (_prevent: boolean, _callback: (options: { repeat: () => void }) => void) =>
    mockDisablePrevention,
);

jest.mock('expo-router', () => ({
  useNavigation: () => ({ canGoBack: mockCanGoBack, goBack: mockGoBack }),
  usePreventRemove: (prevent: boolean, callback: (options: { repeat: () => void }) => void) =>
    mockUsePreventRemove(prevent, callback),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockAlertConfirm } }),
}));

function HookHarness({
  hasUnsavedChanges = true,
  resultRef,
}: {
  hasUnsavedChanges?: boolean;
  resultRef: MutableRefObject<HookResult | undefined>;
}) {
  const result = useProviderApiServiceSheetClose({ hasUnsavedChanges, isSaving: false });

  useEffect(() => {
    resultRef.current = result;
  }, [result, resultRef]);

  return null;
}

describe('useProviderApiServiceSheetClose', () => {
  const hookResultRef: MutableRefObject<HookResult | undefined> = { current: undefined };
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    hookResultRef.current = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function renderHook(hasUnsavedChanges = true) {
    act(() => {
      renderer = create(
        <HookHarness hasUnsavedChanges={hasUnsavedChanges} resultRef={hookResultRef} />,
      );
    });
  }

  test('requests a destructive discard confirmation', () => {
    renderHook();

    act(() => hookResultRef.current?.requestClose());

    expect(mockAlertConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'common.discard',
        description: 'settings.provider.apiService.discardMessage',
        role: 'destructive',
        title: 'settings.provider.apiService.discardTitle',
      }),
    );
  });

  test('closes when the user confirms discard', () => {
    renderHook();
    act(() => hookResultRef.current?.requestClose());

    act(() => mockAlertConfirm.mock.calls[0][0].onConfirm());

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  test('closes without an Alert when there are no unsaved changes', () => {
    renderHook(false);

    act(() => hookResultRef.current?.requestClose());

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockAlertConfirm).not.toHaveBeenCalled();
  });

  test('confirms before a blocked back gesture and repeats it after discard', () => {
    renderHook();
    const [prevent, onPrevented] = mockUsePreventRemove.mock.lastCall!;
    const repeat = jest.fn();

    expect(prevent).toBe(true);
    act(() => onPrevented({ repeat }));
    act(() => mockAlertConfirm.mock.calls[0][0].onConfirm());

    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mockUsePreventRemove.mock.lastCall![0]).toBe(false);
  });

  test('stops blocking once a programmatic close is allowed', () => {
    renderHook();

    act(() => hookResultRef.current?.allowNavigation());

    expect(mockDisablePrevention).toHaveBeenCalledTimes(1);
    expect(mockUsePreventRemove.mock.lastCall![0]).toBe(false);
  });

  test('returns home when the edit screen was opened without a previous screen', () => {
    mockCanGoBack.mockReturnValueOnce(false);
    renderHook(false);

    act(() => hookResultRef.current?.requestClose());

    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
