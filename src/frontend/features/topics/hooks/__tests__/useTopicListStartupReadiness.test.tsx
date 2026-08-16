import { type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { StartupReadinessProvider } from '@/frontend/components/startup/StartupReadinessContext';

import {
  areTopicListStartupQueriesSettled,
  type TopicListStartupQuery,
  useTopicListStartupReadiness,
} from '../useTopicListStartupReadiness';

type Options = Parameters<typeof useTopicListStartupReadiness>[0];
type Readiness = ReturnType<typeof useTopicListStartupReadiness>;

const settledQuery: TopicListStartupQuery = { isLoading: false };
const loadingQuery: TopicListStartupQuery = { isLoading: true };

function renderReadiness(options: Options, reportContentReady = jest.fn()) {
  let current: Readiness | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Probe(props: Options) {
    current = useTopicListStartupReadiness(props);
    return null;
  }

  function Harness({ children }: { children: ReactNode }) {
    return (
      <StartupReadinessProvider reportContentReady={reportContentReady}>
        {children}
      </StartupReadinessProvider>
    );
  }

  act(() => {
    renderer = create(
      <Harness>
        <Probe {...options} />
      </Harness>,
    );
  });

  return {
    get current() {
      if (!current) {
        throw new Error('The topic-list readiness hook did not render');
      }
      return current;
    },
    rerender(next: Options) {
      act(() =>
        renderer?.update(
          <Harness>
            <Probe {...next} />
          </Harness>,
        ),
      );
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

describe('topic-list startup query settlement', () => {
  test('waits while any of topics, pins, or assistants is incomplete', () => {
    expect(
      areTopicListStartupQueriesSettled({
        assistants: settledQuery,
        pins: loadingQuery,
        topics: settledQuery,
      }),
    ).toBe(false);
  });

  test('treats a successful empty result as settled', () => {
    expect(
      areTopicListStartupQueriesSettled({
        assistants: settledQuery,
        pins: settledQuery,
        topics: settledQuery,
      }),
    ).toBe(true);
  });

  test('treats query errors as settled instead of blocking startup forever', () => {
    const failedQuery = { error: new Error('query failed'), isLoading: false };
    expect(
      areTopicListStartupQueriesSettled({
        assistants: failedQuery,
        pins: failedQuery,
        topics: failedQuery,
      }),
    ).toBe(true);
  });
});

describe('useTopicListStartupReadiness', () => {
  let requestAnimationFrameSpy: jest.SpyInstance;
  let cancelAnimationFrameSpy: jest.SpyInstance;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    let nextFrameId = 1;
    frames = new Map();
    requestAnimationFrameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        if (typeof id === 'number') {
          frames.delete(id);
        }
      });
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  test('mounts list content only after all initial queries settle and never closes it again', () => {
    const readiness = renderReadiness({
      assistants: settledQuery,
      pins: loadingQuery,
      topics: settledQuery,
    });
    expect(readiness.current.isInitialDataSettled).toBe(false);

    readiness.rerender({
      assistants: settledQuery,
      pins: settledQuery,
      topics: settledQuery,
    });
    expect(readiness.current.isInitialDataSettled).toBe(true);

    readiness.rerender({
      assistants: settledQuery,
      pins: loadingQuery,
      topics: settledQuery,
    });
    expect(readiness.current.isInitialDataSettled).toBe(true);
    readiness.unmount();
  });

  test('reports LegendList onLoad only after two animation frames', () => {
    const reportContentReady = jest.fn();
    const readiness = renderReadiness(
      { assistants: settledQuery, pins: settledQuery, topics: settledQuery },
      reportContentReady,
    );

    act(() => readiness.current.handleListLoad());
    expect(reportContentReady).not.toHaveBeenCalled();

    act(() => {
      const [firstId, firstFrame] = [...frames.entries()][0];
      frames.delete(firstId);
      firstFrame(0);
    });
    expect(reportContentReady).not.toHaveBeenCalled();

    act(() => {
      const [secondId, secondFrame] = [...frames.entries()][0];
      frames.delete(secondId);
      secondFrame(16);
    });
    expect(reportContentReady).toHaveBeenCalledTimes(1);

    act(() => readiness.current.handleListLoad());
    expect(frames.size).toBe(0);
    readiness.unmount();
  });

  test('cancels a pending readiness frame when the list unmounts', () => {
    const reportContentReady = jest.fn();
    const readiness = renderReadiness(
      { assistants: settledQuery, pins: settledQuery, topics: settledQuery },
      reportContentReady,
    );
    act(() => readiness.current.handleListLoad());
    const [pendingId] = frames.keys();

    readiness.unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(pendingId);
    expect(reportContentReady).not.toHaveBeenCalled();
  });
});
