import { type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { StartupReadinessProvider } from '../StartupReadinessContext';
import { StartupRouteReadyReporter } from '../StartupRouteReadyReporter';

let mockSegments: string[] = [];

jest.mock('expo-router', () => ({
  useSegments: () => mockSegments,
}));

function renderReporter(reportContentReady: () => void) {
  let renderer: ReactTestRenderer | undefined;

  function Harness({ children }: { children: ReactNode }) {
    return (
      <StartupReadinessProvider reportContentReady={reportContentReady}>
        {children}
      </StartupReadinessProvider>
    );
  }

  const makeElement = () => (
    <Harness>
      <StartupRouteReadyReporter>
        <View testID="route-content" />
      </StartupRouteReadyReporter>
    </Harness>
  );

  act(() => {
    renderer = create(makeElement());
  });

  return {
    layout() {
      act(() => renderer?.root.findByProps({ collapsable: false }).props.onLayout());
    },
    rerender() {
      act(() => renderer?.update(makeElement()));
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

describe('StartupRouteReadyReporter', () => {
  let frames: (() => void)[];

  beforeEach(() => {
    mockSegments = [];
    frames = [];
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(() => callback(0));
      return frames.length;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reports the default chat route two frames after its root layout', () => {
    const reportContentReady = jest.fn();
    mockSegments = ['(drawer)', '(chat)'];
    const reporter = renderReporter(reportContentReady);

    reporter.layout();
    act(() => frames.shift()?.());
    act(() => frames.shift()?.());

    expect(reportContentReady).toHaveBeenCalledTimes(1);
    reporter.unmount();
  });

  test('reports a deep-linked route two frames after its root layout', () => {
    const reportContentReady = jest.fn();
    mockSegments = ['(drawer)', 'settings', 'appearance'];
    const reporter = renderReporter(reportContentReady);

    reporter.layout();
    act(() => frames.shift()?.());
    expect(reportContentReady).not.toHaveBeenCalled();

    act(() => frames.shift()?.());
    expect(reportContentReady).toHaveBeenCalledTimes(1);
    reporter.unmount();
  });

  test('waits for route resolution when layout arrives before segments', () => {
    const reportContentReady = jest.fn();
    const reporter = renderReporter(reportContentReady);
    reporter.layout();
    expect(frames).toHaveLength(0);

    mockSegments = ['sessions'];
    reporter.rerender();
    act(() => frames.shift()?.());
    act(() => frames.shift()?.());

    expect(reportContentReady).toHaveBeenCalledTimes(1);
    reporter.unmount();
  });
});
