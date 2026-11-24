import { NavigationContext } from 'expo-router/react-navigation';
import type { ContextType } from 'react';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaneChromeProvider } from '@/frontend/appShell/layout';
import {
  NavigationShellActionsContext,
  type NavigationShellActions,
} from '@/frontend/appShell/navigationShell/state';

import { SelectionToolbar as AndroidSelectionToolbar } from '../SelectionToolbar/SelectionToolbar.android';
import { SelectionToolbar as IOSSelectionToolbar } from '../SelectionToolbar/SelectionToolbar.ios';
import type { SelectionToolbarProps } from '../SelectionToolbar/types';

const originalPlatformVersionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');

function createFocusableNavigation(initialFocused = true) {
  let focused = initialFocused;
  const listeners: Record<'blur' | 'focus', Set<() => void>> = {
    blur: new Set(),
    focus: new Set(),
  };
  const navigation = {
    addListener: (event: 'blur' | 'focus', listener: () => void) => {
      listeners[event].add(listener);
      return () => {
        listeners[event].delete(listener);
      };
    },
    isFocused: () => focused,
  } as unknown as ContextType<typeof NavigationContext>;

  const emit = (event: 'blur' | 'focus') => {
    focused = event === 'focus';
    for (const listener of listeners[event]) {
      listener();
    }
  };

  return { emit, navigation };
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeInDown: { duration: () => undefined },
    FadeOutDown: { duration: () => undefined },
  };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable, View } = jest.requireActual('react-native');
  const Toolbar = Object.assign((props: object) => React.createElement(View, props), {
    Button: (props: object) => React.createElement(Pressable, props),
    Spacer: () => null,
  });
  return { Color: { ios: { systemRed: 'red' } }, Stack: { Toolbar } };
});

describe.each([
  ['Android', AndroidSelectionToolbar],
  ['iOS', IOSSelectionToolbar],
] as const)('%s SelectionToolbar', (_platform, Toolbar) => {
  let renderer: ReactTestRenderer;
  const onToggleAll = jest.fn();
  const baseProps: SelectionToolbarProps = {
    allSelected: false,
    isPending: false,
    onDelete: jest.fn(),
    onToggleAll,
    selectableCount: 3,
    selectedCount: 1,
  };

  beforeEach(() => {
    Object.defineProperty(Platform, 'Version', { configurable: true, value: '18.0' });
  });

  afterEach(async () => {
    await act(async () => renderer.unmount());
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalPlatformVersionDescriptor) {
      Object.defineProperty(Platform, 'Version', originalPlatformVersionDescriptor);
    }
  });

  it('keeps select all an action when partially selected and switches to deselect all', async () => {
    await act(async () => {
      renderer = create(<Toolbar {...baseProps} />);
    });

    const selectAll = findButton('common.selection.selectAll');
    expect(selectAll.props.disabled).toBe(false);
    act(() => selectAll.props.onPress());
    expect(onToggleAll).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(<Toolbar {...baseProps} allSelected selectedCount={3} />);
    });

    expect(findButton('common.selection.deselectAll').props.disabled).toBe(false);
  });

  it.each([
    { isPending: false, selectableCount: 0, selectedCount: 0 },
    { isPending: true, selectableCount: 3, selectedCount: 1 },
  ])('disables unavailable actions for %j', async (state) => {
    await act(async () => {
      renderer = create(
        <Toolbar
          {...baseProps}
          {...state}
          actions={[{ id: 'move', label: 'Move', onPress: jest.fn() }]}
        />,
      );
    });

    expect(findButton('common.selection.selectAll').props.disabled).toBe(true);
    expect(findButton('common.delete').props.disabled).toBe(true);
    expect(findButton('Move').props.disabled).toBe(true);
  });

  it('hides the floating dock while mounted and releases it on unmount', async () => {
    let activeHideCount = 0;
    const registerHideDock = jest.fn(() => {
      activeHideCount += 1;
      return () => {
        activeHideCount -= 1;
      };
    });
    const navigationActions = { registerHideDock } as unknown as NavigationShellActions;

    await act(async () => {
      renderer = create(
        <NavigationShellActionsContext value={navigationActions}>
          <Toolbar {...baseProps} />
        </NavigationShellActionsContext>,
      );
    });

    expect(registerHideDock).toHaveBeenCalled();
    expect(activeHideCount).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
    expect(activeHideCount).toBe(0);
  });

  it('releases and re-acquires floating dock hiding on blur and focus', async () => {
    let activeHideCount = 0;
    const registerHideDock = jest.fn(() => {
      activeHideCount += 1;
      return () => {
        activeHideCount -= 1;
      };
    });
    const navigationActions = { registerHideDock } as unknown as NavigationShellActions;
    const { emit, navigation } = createFocusableNavigation(true);

    await act(async () => {
      renderer = create(
        <NavigationContext value={navigation}>
          <NavigationShellActionsContext value={navigationActions}>
            <Toolbar {...baseProps} />
          </NavigationShellActionsContext>
        </NavigationContext>,
      );
    });

    expect(activeHideCount).toBeGreaterThan(0);

    await act(async () => emit('blur'));
    expect(activeHideCount).toBe(0);

    await act(async () => emit('focus'));
    expect(activeHideCount).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
    expect(activeHideCount).toBe(0);
  });

  function findButton(label: string) {
    const button = renderer.root
      .findAllByProps({ accessibilityLabel: label })
      .find((node) => typeof node.props.onPress === 'function');
    if (!button) throw new Error(`Missing selection action: ${label}`);
    return button;
  }
});

describe('iOS SelectionToolbar fallbacks', () => {
  const props: SelectionToolbarProps = {
    allSelected: false,
    isPending: false,
    onDelete: jest.fn(),
    onToggleAll: jest.fn(),
    selectableCount: 3,
    selectedCount: 1,
  };

  afterEach(() => {
    if (originalPlatformVersionDescriptor) {
      Object.defineProperty(Platform, 'Version', originalPlatformVersionDescriptor);
    }
  });

  it('renders InlineSelectionToolbar inside PaneChromeProvider and balances dock hiding', async () => {
    Object.defineProperty(Platform, 'Version', { configurable: true, value: '18.0' });
    let activeHideCount = 0;
    const registerHideDock = jest.fn(() => {
      activeHideCount += 1;
      return () => {
        activeHideCount -= 1;
      };
    });
    const navigationActions = { registerHideDock } as unknown as NavigationShellActions;

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <NavigationShellActionsContext value={navigationActions}>
          <PaneChromeProvider titleAlign="left">
            <IOSSelectionToolbar {...props} />
          </PaneChromeProvider>
        </NavigationShellActionsContext>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'selection-toolbar' })).toBeTruthy();
    expect(renderer!.root.findAllByProps({ placement: 'bottom' })).toHaveLength(0);
    expect(registerHideDock).toHaveBeenCalled();
    expect(activeHideCount).toBeGreaterThan(0);

    await act(async () => renderer!.unmount());
    expect(activeHideCount).toBe(0);
  });

  it('falls back to InlineSelectionToolbar on iOS 17 where Stack.Toolbar bottom host is unsupported', async () => {
    Object.defineProperty(Platform, 'Version', { configurable: true, value: '17.6' });
    let activeHideCount = 0;
    const registerHideDock = jest.fn(() => {
      activeHideCount += 1;
      return () => {
        activeHideCount -= 1;
      };
    });
    const navigationActions = { registerHideDock } as unknown as NavigationShellActions;

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <NavigationShellActionsContext value={navigationActions}>
          <IOSSelectionToolbar {...props} />
        </NavigationShellActionsContext>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'selection-toolbar' })).toBeTruthy();
    expect(renderer!.root.findAllByProps({ placement: 'bottom' })).toHaveLength(0);
    expect(registerHideDock).toHaveBeenCalled();
    expect(activeHideCount).toBeGreaterThan(0);

    await act(async () => renderer!.unmount());
    expect(activeHideCount).toBe(0);
  });
});
