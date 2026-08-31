import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  type MessageListInitialRenderGateOptions,
  shouldWaitForInitialHistoryLayout,
  useMessageListInitialRenderGate,
} from '../useMessageListInitialRenderGate';

type GateResult = ReturnType<typeof useMessageListInitialRenderGate>;

function renderGate(options: MessageListInitialRenderGateOptions) {
  let latest: GateResult | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Probe(props: MessageListInitialRenderGateOptions) {
    latest = useMessageListInitialRenderGate(props);
    return null;
  }

  act(() => {
    renderer = create(<Probe {...options} />);
  });

  return {
    get current() {
      if (!latest) {
        throw new Error('The gate hook did not render.');
      }

      return latest;
    },
    rerender(next: MessageListInitialRenderGateOptions) {
      act(() => {
        renderer?.update(<Probe {...next} />);
      });
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

const historyEntry: MessageListInitialRenderGateOptions = {
  renderGateKey: 'topic-1',
  requiresInitialHistoryLayout: true,
};

describe('useMessageListInitialRenderGate', () => {
  let gate: ReturnType<typeof renderGate> | undefined;

  afterEach(() => {
    gate?.unmount();
    gate = undefined;
    jest.restoreAllMocks();
  });

  it('covers an entered topic that requires initial history layout', () => {
    gate = renderGate(historyEntry);

    expect(gate.current.isCoverVisible).toBe(true);
  });

  it('does not cover a render that has no initial history to lay out', () => {
    gate = renderGate({ ...historyEntry, requiresInitialHistoryLayout: false });

    expect(gate.current.isCoverVisible).toBe(false);
  });

  it('does not close again after the current render resolves without layout', () => {
    gate = renderGate({ ...historyEntry, requiresInitialHistoryLayout: false });

    gate.rerender(historyEntry);

    expect(gate.current.isCoverVisible).toBe(false);
  });

  it('reveals the list one frame after it reports being laid out', () => {
    const frames: (() => void)[] = [];
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(() => callback(0));
      return frames.length;
    });

    gate = renderGate(historyEntry);
    act(() => {
      gate?.current.markListLoaded();
    });

    expect(gate.current.isCoverVisible).toBe(true);

    act(() => {
      for (const frame of frames) {
        frame();
      }
    });

    expect(gate.current.isCoverVisible).toBe(false);
  });

  it('resets resolution when the render key changes, including A to B to A', () => {
    const frames: (() => void)[] = [];
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(() => callback(0));
      return frames.length;
    });
    gate = renderGate(historyEntry);
    act(() => {
      gate?.current.markListLoaded();
      frames.shift()?.();
    });
    expect(gate.current.isCoverVisible).toBe(false);

    gate.rerender({ ...historyEntry, renderGateKey: 'topic-2' });
    expect(gate.current.isCoverVisible).toBe(true);

    gate.rerender(historyEntry);
    expect(gate.current.isCoverVisible).toBe(true);
  });

  it('cancels a pending ready frame when the render key changes', () => {
    let pendingFrame: FrameRequestCallback | undefined;
    const cancelAnimationFrameSpy = jest.spyOn(globalThis, 'cancelAnimationFrame');
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrame = callback;
      return 42;
    });
    gate = renderGate(historyEntry);
    act(() => {
      gate?.current.markListLoaded();
    });

    gate.rerender({ ...historyEntry, renderGateKey: 'topic-2' });

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(42);
    expect(gate.current.isCoverVisible).toBe(true);

    act(() => {
      pendingFrame?.(0);
    });
    expect(gate.current.isCoverVisible).toBe(true);
  });
});

describe('shouldWaitForInitialHistoryLayout', () => {
  it('waits while a normal topic query is loading', () => {
    expect(
      shouldWaitForInitialHistoryLayout({
        hasHistoryBeforeActiveTurn: undefined,
        isLoadingInitial: true,
        messageCount: 0,
      }),
    ).toBe(true);
  });

  it('waits for loaded history, including an existing topic that is streaming', () => {
    expect(
      shouldWaitForInitialHistoryLayout({
        hasHistoryBeforeActiveTurn: true,
        isLoadingInitial: false,
        messageCount: 2,
      }),
    ).toBe(true);
  });

  it('does not wait for a first exchange handed over by the runtime', () => {
    expect(
      shouldWaitForInitialHistoryLayout({
        hasHistoryBeforeActiveTurn: false,
        isLoadingInitial: true,
        messageCount: 0,
      }),
    ).toBe(false);
  });

  it('does not wait after an empty topic query settles', () => {
    expect(
      shouldWaitForInitialHistoryLayout({
        hasHistoryBeforeActiveTurn: undefined,
        isLoadingInitial: false,
        messageCount: 0,
      }),
    ).toBe(false);
  });
});
