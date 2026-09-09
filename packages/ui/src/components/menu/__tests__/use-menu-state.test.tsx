import { createRef } from 'react';
import { Dimensions, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { focusMenuTarget } from '../menu-focus';
import { useMenuState } from '../use-menu-state';

jest.mock('../menu-focus', () => ({ focusMenuTarget: jest.fn() }));

const anchor = { height: 44, pageX: 16, pageY: 120, width: 44 };
const triggerRef = createRef<View>();

function Harness() {
  return <View {...useMenuState(triggerRef)} testID="menu-state" />;
}

describe('menu lifecycle', () => {
  let renderer: ReactTestRenderer;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  const state = () =>
    renderer.root.findByProps({ testID: 'menu-state' }).props as ReturnType<typeof useMenuState>;

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
    act(() => {
      renderer = create(<Harness />);
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('dispatches one selection only after dismissal, even with repeated presses and completion callbacks', () => {
    const action = jest.fn();
    const secondAction = jest.fn();
    act(() => state().open(anchor));
    act(() => {
      state().close(action);
      state().close(secondAction);
    });
    expect(state().isOpen).toBe(false);
    expect(state().anchor).toBe(anchor);
    expect(action).not.toHaveBeenCalled();
    const finish = state().finishClose;
    act(() => {
      finish();
      finish();
    });
    expect(state().anchor).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
    expect(secondAction).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('ignores a previous presentation finishing after another presentation has started closing', () => {
    act(() => state().open(anchor));
    const oldFinish = state().finishClose;
    act(() => state().close());
    act(() => state().open({ ...anchor, pageY: 200 }));
    const action = jest.fn();
    act(() => state().close(action));
    act(() => oldFinish());
    expect(state().anchor?.pageY).toBe(200);
    expect(action).not.toHaveBeenCalled();
    act(() => state().finishClose());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('restores focus after a plain dismissal, but cancels restoration when reopening', () => {
    act(() => state().open(anchor));
    act(() => state().close());
    act(() => state().finishClose());
    expect(frames.size).toBe(1);
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    });
    expect(focusMenuTarget).toHaveBeenCalledWith(triggerRef.current);
    act(() => state().open({ ...anchor }));
    act(() => state().close());
    act(() => state().finishClose());
    act(() => state().open({ ...anchor }));
    expect(frames.size).toBe(0);
  });

  it('cancels a queued selection when its owner unmounts before native dismissal', () => {
    const action = jest.fn();
    act(() => state().open(anchor));
    act(() => state().close(action));
    const finish = state().finishClose;
    act(() => renderer.update(<View />));
    act(() => finish());
    expect(action).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('subscribes to viewport changes only while a presentation exists', () => {
    const subscribe = jest.spyOn(Dimensions, 'addEventListener');
    expect(subscribe).not.toHaveBeenCalled();
    act(() => state().open(anchor));
    const remove = jest.spyOn(subscribe.mock.results[0].value, 'remove');
    act(() =>
      subscribe.mock.calls[0][1]({
        window: { ...Dimensions.get('window'), width: Dimensions.get('window').width + 1 },
        screen: Dimensions.get('screen'),
      }),
    );
    expect(state().isOpen).toBe(false);
    act(() => state().finishClose());
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
