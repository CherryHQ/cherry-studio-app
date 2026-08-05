import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useProviderApiServiceSheetClose } from '../useProviderApiServiceSheetClose';

type HookResult = ReturnType<typeof useProviderApiServiceSheetClose>;

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());
let hookResult: HookResult | undefined;

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

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return { Alert: (props: object) => createElement('Alert', props) };
});

function HookHarness({ hasUnsavedChanges = true }: { hasUnsavedChanges?: boolean }) {
  hookResult = useProviderApiServiceSheetClose({ hasUnsavedChanges, isSaving: false });
  return hookResult.discardDialog;
}

describe('useProviderApiServiceSheetClose', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    hookResult = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function renderHook(hasUnsavedChanges = true) {
    act(() => {
      renderer = create(<HookHarness hasUnsavedChanges={hasUnsavedChanges} />);
    });
  }

  function alert() {
    if (!renderer) {
      throw new Error('Hook was not rendered');
    }
    return renderer.root.findByType('Alert');
  }

  test('uses cancel and destructive Alert actions', () => {
    renderHook();

    act(() => hookResult?.requestClose());

    expect(alert().props.isOpen).toBe(true);
    expect(alert().props.actions).toEqual([
      expect.objectContaining({ label: 'common.cancel', role: 'cancel' }),
      expect.objectContaining({ label: 'common.discard', role: 'destructive' }),
    ]);
  });

  test('keeps the pending close action when Alert closes before invoking discard', () => {
    renderHook();
    act(() => hookResult?.requestClose());

    const discardAction = alert().props.actions[1];
    act(() => alert().props.onOpenChange(false));
    act(() => discardAction.onPress());

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  test('closes without an Alert when there are no unsaved changes', () => {
    renderHook(false);

    act(() => hookResult?.requestClose());

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(alert().props.isOpen).toBe(false);
  });
});
