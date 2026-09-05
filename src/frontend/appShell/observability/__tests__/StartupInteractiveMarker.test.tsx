import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { StartupInteractiveMarker } from '../StartupInteractiveMarker';

const mockMarkInteractive = jest.fn();

jest.mock('expo-observe', () => ({
  useObserve: () => ({ markInteractive: mockMarkInteractive }),
}));

describe('StartupInteractiveMarker', () => {
  // Handles are issued monotonically and cancellation deletes the entry, so a
  // cancelled frame is genuinely unreachable. Reusing indices would let a
  // cancel land on whichever callback happened to take the freed slot.
  let frames: Map<number, () => void>;
  let nextHandle: number;

  beforeEach(() => {
    frames = new Map();
    nextHandle = 0;
    mockMarkInteractive.mockClear();
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      nextHandle += 1;
      frames.set(nextHandle, () => callback(0));
      return nextHandle;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((handle) => {
      if (handle != null) {
        frames.delete(handle);
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function render() {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<StartupInteractiveMarker />);
    });
    return renderer as ReactTestRenderer;
  }

  function runNextFrame() {
    const [handle, frame] = frames.entries().next().value ?? [];
    if (handle === undefined) {
      return;
    }

    frames.delete(handle);
    act(() => frame?.());
  }

  function drainFrames() {
    while (frames.size > 0) {
      runNextFrame();
    }
  }

  test('marks interactive two frames after mount', () => {
    const renderer = render();

    runNextFrame();
    expect(mockMarkInteractive).not.toHaveBeenCalled();

    runNextFrame();
    expect(mockMarkInteractive).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  test('marks once even when the screen re-renders after the mark', () => {
    const renderer = render();

    drainFrames();
    act(() => renderer.update(<StartupInteractiveMarker />));
    drainFrames();

    expect(mockMarkInteractive).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  test('never marks when the screen unmounts before the second frame', () => {
    const renderer = render();

    runNextFrame();
    act(() => renderer.unmount());
    drainFrames();

    expect(mockMarkInteractive).not.toHaveBeenCalled();
  });
});
