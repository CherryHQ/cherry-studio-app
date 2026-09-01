import { useEffect } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerDock } from '../components/composer-dock';
import { useComposerDockLayout } from '../hooks/use-composer-dock-layout';

let mockBottomInset = 34;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: mockBottomInset, left: 0, right: 0, top: 0 }),
}));

jest.mock('react-native-keyboard-controller', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    KeyboardStickyView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(MockView, { ...props, testID: 'keyboard-sticky-view' }, children),
  };
});

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (initialValue: number) => {
    const { useRef } = jest.requireActual('react');
    return useRef({
      set(nextValue: number) {
        this.value = nextValue;
      },
      value: initialValue,
    }).current;
  },
}));

type DockLayout = ReturnType<typeof useComposerDockLayout>;

let dockLayout: DockLayout | undefined;

function DockLayoutProbe() {
  const currentLayout = useComposerDockLayout();

  useEffect(() => {
    dockLayout = currentLayout;
  }, [currentLayout]);

  return null;
}

describe('Composer.Dock', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBottomInset = 34;
    dockLayout = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('applies safe-area geometry, keyboard offset, and measured height', () => {
    const onHeightChange = jest.fn();
    const onLayout = jest.fn();

    act(() => {
      renderer = create(
        <ComposerDock onHeightChange={onHeightChange} onLayout={onLayout}>
          <View testID="content" />
        </ComposerDock>,
      );
    });

    const container = renderer!.root.findByProps({ pointerEvents: 'box-none' });
    const stickyView = renderer!.root.findByProps({ testID: 'keyboard-sticky-view' });
    const layoutEvent = { nativeEvent: { layout: { height: 126 } } };

    expect(container.props.style).toEqual({ paddingBottom: 38, paddingHorizontal: 16 });
    expect(stickyView.props.offset).toEqual({ opened: 26 });

    act(() => container.props.onLayout(layoutEvent));

    expect(onHeightChange).toHaveBeenCalledWith(126);
    expect(onLayout).toHaveBeenCalledWith(layoutEvent);
  });

  it('reserves the minimum dock height and tracks live height updates', () => {
    act(() => {
      renderer = create(<DockLayoutProbe />);
    });

    expect(dockLayout).toMatchObject({
      contentBottomInset: 134,
      inputHeight: 126,
      keyboardOffset: 26,
    });
    expect(dockLayout?.inputHeightShared.value).toBe(126);

    act(() => dockLayout?.handleInputHeightChange(140.2));

    expect(dockLayout).toMatchObject({ contentBottomInset: 149, inputHeight: 141 });
    expect(dockLayout?.inputHeightShared.value).toBe(140.2);

    act(() => dockLayout?.handleInputHeightChange(20));

    expect(dockLayout).toMatchObject({ contentBottomInset: 134, inputHeight: 126 });
    expect(dockLayout?.inputHeightShared.value).toBe(20);
  });

  it('uses minimum padding when the device has no bottom inset', () => {
    mockBottomInset = 0;

    act(() => {
      renderer = create(
        <ComposerDock onHeightChange={jest.fn()}>
          <View />
        </ComposerDock>,
      );
    });

    expect(renderer!.root.findByProps({ pointerEvents: 'box-none' }).props.style).toEqual({
      paddingBottom: 12,
      paddingHorizontal: 16,
    });
    expect(renderer!.root.findByProps({ testID: 'keyboard-sticky-view' }).props.offset).toEqual({
      opened: 0,
    });
  });

  it('can participate in parent flow without measuring its animated height', () => {
    act(() => {
      renderer = create(
        <ComposerDock layoutMode="flow">
          <View />
        </ComposerDock>,
      );
    });

    const container = renderer!.root.findByProps({ pointerEvents: 'box-none' });
    expect(container.props.className).toBe('z-10 shrink-0');
    expect(container.props.onLayout).toBeUndefined();
  });
});
