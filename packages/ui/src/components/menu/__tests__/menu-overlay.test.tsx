import { type ReactNode } from 'react';
import { BackHandler, Keyboard, Modal, Platform, View } from 'react-native';
import { KeyboardController, OverKeyboardView } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { focusMenuTarget } from '../menu-focus';
import { useMenuInteraction } from '../menu-interaction';
import { KeyboardMenuOverlay, MenuOverlay } from '../menu-overlay';

jest.mock('../menu-focus', () => ({ focusMenuTarget: jest.fn() }));
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual('react-native');
  return { GestureHandlerRootView: View };
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

  it('waits for the Android invisible commit because that platform has no onDismiss event', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    act(() => renderer.update(render(false, false)));
    expect(closed).not.toHaveBeenCalled();
    act(() => [...frames.values()].forEach((callback) => callback(0)));
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

describe('keyboard-preserving menu overlay', () => {
  let renderer: ReactTestRenderer;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let back: () => boolean | null | undefined;
  const removeBack = jest.fn();
  const close = jest.fn();
  const closed = jest.fn();
  const render = (isOpen = true, isVisible = true) => (
    <KeyboardMenuOverlay
      isOpen={isOpen}
      isVisible={isVisible}
      onClose={close}
      onClosed={closed}
      testID="menu"
    >
      <Item />
    </KeyboardMenuOverlay>
  );

  function flushFrame() {
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
  }

  beforeEach(() => {
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
    act(() => expect(back()).toBe(true));
    expect(close).toHaveBeenCalledTimes(1);
    act(() => renderer.update(render(false, true)));
    act(() => expect(back()).toBe(true));
    expect(close).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();

    act(() => renderer.update(render(false, false)));
    expect(renderer.root.findByType(OverKeyboardView).props.visible).toBe(false);
    expect(removeBack).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    flushFrame();
    expect(closed).toHaveBeenCalledTimes(1);
  });

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
