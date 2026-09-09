import { type ReactNode } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { focusMenuTarget } from '../menu-focus';
import { useMenuInteraction } from '../menu-interaction';
import { MenuOverlay } from '../menu-overlay';

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
      frames.delete(id);
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
    act(() => renderer.root.findByType(Pressable).props.onPress());
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
