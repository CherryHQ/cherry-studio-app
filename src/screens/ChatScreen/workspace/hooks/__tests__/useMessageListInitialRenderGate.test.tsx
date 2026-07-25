import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  type MessageListInitialRenderGateOptions,
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

const listEntry: MessageListInitialRenderGateOptions = {
  hasMessages: true,
  isHandedOverFromNewTopic: false,
  isLoadingInitial: true,
  renderGateKey: 'topic-1',
};

describe('useMessageListInitialRenderGate', () => {
  let gate: ReturnType<typeof renderGate> | undefined;

  afterEach(() => {
    gate?.unmount();
    gate = undefined;
  });

  it('covers the list while a topic opened from the list is still loading', () => {
    gate = renderGate(listEntry);

    expect(gate.current.isCoverVisible).toBe(true);
  });

  it('keeps covering an entered topic until the list reports it has laid out', () => {
    gate = renderGate(listEntry);

    gate.rerender({ ...listEntry, isLoadingInitial: false });

    // Messages arrived, but the list has not called onReady yet — the cover is
    // what hides the first-frame measurement correction.
    expect(gate.current.isCoverVisible).toBe(true);
  });

  it('never covers a topic handed over from the new-topic screen', () => {
    // The user message is already in the runtime overlay, so `isLoadingInitial`
    // here only means "the message query key is new".
    gate = renderGate({ ...listEntry, isHandedOverFromNewTopic: true });

    expect(gate.current.isCoverVisible).toBe(false);
  });

  it('reveals the list one frame after it reports being laid out', () => {
    const frames: (() => void)[] = [];
    const requestAnimationFrameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        frames.push(() => callback(0));
        return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
      });

    gate = renderGate({ ...listEntry, isLoadingInitial: false });
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

    requestAnimationFrameSpy.mockRestore();
  });
});
