import { useEffect, type MutableRefObject } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useProviderApiServiceSheetClose } from '../useProviderApiServiceSheetClose';

type HookResult = ReturnType<typeof useProviderApiServiceSheetClose>;

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());
const mockAlertConfirm = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    addListener: mockAddListener,
    dispatch: mockDispatch,
    goBack: mockGoBack,
  }),
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
});
