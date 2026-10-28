import { PanResponder, type PanResponderCallbacks } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useImagePanResponder } from '../use-image-pan-responder';

test('keeps the active responder while refreshed callbacks receive the completed drag', () => {
  let callbacks: PanResponderCallbacks | undefined;
  const spy = jest.spyOn(PanResponder, 'create').mockImplementation((next) => {
    callbacks = next;
    return { panHandlers: {} } as unknown as ReturnType<typeof PanResponder.create>;
  });
  const first = jest.fn();
  const refreshed = jest.fn();
  const released = jest.fn();
  let renderer: ReactTestRenderer | undefined;
  function Probe({ onMove }: { onMove: () => void }) {
    useImagePanResponder({ onPanResponderMove: onMove, onPanResponderRelease: released });
    return null;
  }
  try {
    act(() => {
      renderer = create(<Probe onMove={first} />);
    });
    callbacks!.onPanResponderMove!({} as never, {} as never);
    act(() => {
      renderer!.update(<Probe onMove={refreshed} />);
    });
    const gesture = { dx: 30, dy: 0 };
    callbacks!.onPanResponderMove!({} as never, gesture as never);
    callbacks!.onPanResponderRelease!({} as never, gesture as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledWith({}, gesture);
  } finally {
    act(() => renderer?.unmount());
    spy.mockRestore();
  }
});
