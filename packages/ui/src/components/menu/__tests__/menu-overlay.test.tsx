import { type ReactNode, useLayoutEffect } from 'react';
import { BackHandler, Keyboard, Modal, Platform, View } from 'react-native';
import { KeyboardController, OverKeyboardView } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { OverlayNavigationProvider, useOverlayNavigation } from '../../portal/overlay-navigation';
import { focusMenuTarget } from '../menu-focus';
import { useMenuInteraction } from '../menu-interaction';
import { KeyboardMenuOverlay, MenuOverlay } from '../menu-overlay';
import NativeMenuEscapeView from '../specs/MenuEscapeNativeComponent';

jest.mock('../menu-focus', () => ({ focusMenuTarget: jest.fn() }));
jest.mock('../specs/MenuEscapeNativeComponent', () => 'NativeMenuEscapeView');
jest.mock('react-native-gesture-handler', () => {
  const { Pressable, View } = jest.requireActual('react-native');
  return { GestureHandlerRootView: View, Pressable };
});
jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const native = jest.requireActual('react-native');
  return Object.defineProperty(Object.create(native), 'Modal', {
    value: (props: { children: ReactNode }) => React.createElement(native.View, props),
  });
});

function Item() {
  const { registerItem } = useMenuInteraction();
  return (
    <View
      accessible
      ref={(target) => (target ? registerItem?.(target) : undefined)}
      testID="first-item"
    />
  );
}

describe('menu overlay native boundary', () => {
  let renderer: ReactTestRenderer;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const close = jest.fn();
  const closed = jest.fn();
  const render = (isOpen = true, isVisible = true) => (
    <MenuOverlay
      isOpen={isOpen}
      isVisible={isVisible}
      onClose={close}
      onClosed={closed}
      testID="menu"
    >
      <Item />
    </MenuOverlay>
  );

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
      if (id != null) {
        frames.delete(id);
      }
    });
    jest.replaceProperty(Platform, 'OS', 'ios');
    act(() => {
      renderer = create(render());
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('keeps navigation pending until the native overlay actually dismisses', async () => {
    let prepare!: ReturnType<typeof useOverlayNavigation>['prepareForNavigation'];
    function Probe() {
      const navigation = useOverlayNavigation();
      useLayoutEffect(() => {
        prepare = navigation.prepareForNavigation;
      });
      return null;
    }
    const tree = (open: boolean) => (
      <OverlayNavigationProvider>
        <Probe />
        {render(open, open)}
      </OverlayNavigationProvider>
    );
    act(() => renderer.update(tree(true)));
    const navigate = jest.fn();
    let pending!: Promise<void>;
    await act(async () => {
      pending = prepare(new AbortController().signal).then(navigate);
    });
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => renderer.update(tree(false)));
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => renderer.root.findByType(Modal).props.onDismiss());
    await pending;
    expect(navigate).toHaveBeenCalledWith(true);
  });

  it('routes native Back/Escape and outside presses through the same close without completing dismissal early', () => {
    const modal = renderer.root.findByType(Modal);
    expect(modal.props).toMatchObject({
      transparent: true,
      presentationStyle: 'overFullScreen',
      visible: true,
    });
    act(() => modal.props.onRequestClose());
    act(() => renderer.root.findByProps({ testID: 'menu-backdrop' }).props.onPress());
    expect(close).toHaveBeenCalledTimes(2);
    act(() => renderer.update(render(false, false)));
    expect(closed).not.toHaveBeenCalled();
    act(() => renderer.root.findByType(Modal).props.onDismiss());
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('focuses the first registered item after presentation and cancels a pending focus when closing', () => {
    act(() => renderer.root.findByType(Modal).props.onShow());
    expect(focusMenuTarget).not.toHaveBeenCalled();
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
    expect(focusMenuTarget).toHaveBeenCalledTimes(1);
    expect(focusMenuTarget).not.toHaveBeenCalledWith(null);
    act(() => renderer.root.findByType(Modal).props.onShow());
    act(() => renderer.update(render(false)));
    expect(frames.size).toBe(0);
  });
});

describe.each([
  { platform: 'ios', Overlay: KeyboardMenuOverlay, name: 'composer' },
  { platform: 'android', Overlay: KeyboardMenuOverlay, name: 'composer' },
  { platform: 'android', Overlay: MenuOverlay, name: 'action menu' },
] as const)('keyboard-preserving $name overlay ($platform)', ({ platform, Overlay }) => {
  let renderer: ReactTestRenderer;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let back: Parameters<typeof BackHandler.addEventListener>[1];
  const removeBack = jest.fn();
  const close = jest.fn();
  const closed = jest.fn();
  const render = (isOpen = true, isVisible = true) => (
    <Overlay isOpen={isOpen} isVisible={isVisible} onClose={close} onClosed={closed} testID="menu">
      <Item />
    </Overlay>
  );

  function flushFrame() {
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
  }

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', platform);
    frames = new Map();
    nextFrame = 0;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
      if (id != null) frames.delete(id);
    });
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => {
      back = callback;
      return { remove: removeBack };
    });
    jest.spyOn(Keyboard, 'dismiss');
    act(() => {
      renderer = create(render());
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('opens and cancels without a focus-taking Modal or keyboard dismissal', () => {
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
    expect(renderer.root.findByType(OverKeyboardView).props.visible).toBe(true);
    flushFrame();
    flushFrame();
    expect(focusMenuTarget).toHaveBeenCalledTimes(1);
    act(() => renderer.root.findByProps({ testID: 'menu-backdrop' }).props.onPress());
    expect(close).toHaveBeenCalledTimes(1);
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
    expect(KeyboardController.dismiss).not.toHaveBeenCalled();
    expect(KeyboardController.setFocusTo).not.toHaveBeenCalled();
  });

  it('consumes Back while visible and dispatches completion only after overlay removal', () => {
    act(() => expect(back({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => renderer.update(render(false, true)));
    act(() => expect(back({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true));
    expect(close).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();

    act(() => renderer.update(render(false, false)));
    expect(renderer.root.findByType(OverKeyboardView).props.visible).toBe(false);
    expect(removeBack).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    flushFrame();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  if (platform === 'android') {
    it('routes Escape through close, retains its listener during closing, and releases it on removal', () => {
      const escape = () =>
        renderer.root.findByType(NativeMenuEscapeView).props.onEscape({
          nativeEvent: { key: 'Escape' },
        });
      act(escape);
      expect(close).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();
      expect(Keyboard.dismiss).not.toHaveBeenCalled();
      expect(KeyboardController.setFocusTo).not.toHaveBeenCalled();

      act(() => renderer.update(render(false, true)));
      act(escape);
      expect(close).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();

      act(() => renderer.update(render(false, false)));
      expect(renderer.root.findAllByType(NativeMenuEscapeView)).toHaveLength(0);
      expect(closed).not.toHaveBeenCalled();
      flushFrame();
      expect(closed).toHaveBeenCalledTimes(1);
    });
  }

  it('cancels a queued dismissal when the menu reopens or unmounts', () => {
    act(() => renderer.update(render(false, false)));
    act(() => renderer.update(render()));
    flushFrame();
    expect(closed).not.toHaveBeenCalled();
    act(() => renderer.update(render(false, false)));
    act(() => renderer.update(<View />));
    flushFrame();
    expect(closed).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
