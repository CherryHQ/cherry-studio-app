import { type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PreferenceSchema } from '@/shared/data/preference';

import { StartupReadinessProvider } from '../StartupReadinessContext';
import { StartupRouteReadyReporter } from '../StartupRouteReadyReporter';

let mockSegments: string[] = [];
let mockStatus: PreferenceSchema['app.onboarding.status'];
const mockEligibility = jest.fn();
jest.mock('@/frontend/data', () => ({ usePreference: () => [mockStatus] }));
jest.mock('@/frontend/appShell/navigation/useFirstUseEligibility', () => ({
  useFirstUseEligibility: () => mockEligibility(),
}));
jest.mock('@/frontend/appShell/navigation', () =>
  jest.requireActual('@/frontend/appShell/navigation/FirstUseAdmission'),
);

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
    mockStatus = 'completed';
    mockEligibility.mockReset();
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
    mockSegments = ['(drawer)', '(content)', '(main)', '(chat)'];
    const reporter = renderReporter(reportContentReady);

    reporter.layout();
    act(() => frames.shift()?.());
    act(() => frames.shift()?.());

    expect(reportContentReady).toHaveBeenCalledTimes(1);
    expect(mockEligibility).not.toHaveBeenCalled();
    reporter.unmount();
  });

  test.each(['unseen', 'welcome'] as const)(
    'waits for onboarding to replace a %s drawer route',
    (status) => {
      mockStatus = status;
      mockEligibility.mockReturnValue('new');
      mockSegments = ['(drawer)', '(content)', '(main)', '(chat)'];
      const ready = jest.fn();
      const reporter = renderReporter(ready);
      reporter.layout();

      expect(frames).toHaveLength(0);
      expect(ready).not.toHaveBeenCalled();
      if (status === 'welcome') expect(mockEligibility).not.toHaveBeenCalled();

      mockSegments = ['onboarding'];
      reporter.rerender();
      act(() => frames.shift()?.());
      expect(ready).not.toHaveBeenCalled();
      act(() => frames.shift()?.());
      expect(ready).toHaveBeenCalledTimes(1);
      reporter.unmount();
    },
  );

  test('reports the drawer as soon as an unseen status is confirmed to belong to an existing install', () => {
    mockStatus = 'unseen';
    mockEligibility.mockReturnValue('loading');
    mockSegments = ['(drawer)', '(content)', '(main)', '(chat)'];
    const ready = jest.fn();
    const reporter = renderReporter(ready);
    reporter.layout();
    expect(frames).toHaveLength(0);

    mockEligibility.mockReturnValue('existing');
    reporter.rerender();
    act(() => frames.shift()?.());
    act(() => frames.shift()?.());
    expect(ready).toHaveBeenCalledTimes(1);
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

  test('keeps the cold UU callback covered until the restored route is laid out', () => {
    const reportContentReady = jest.fn();
    mockSegments = ['uu-remote', 'callback'];
    const reporter = renderReporter(reportContentReady);
    reporter.layout();
    expect(frames).toHaveLength(0);
    expect(reportContentReady).not.toHaveBeenCalled();

    mockSegments = ['(drawer)', '(content)', '(main)', '(chat)', 'remote'];
    reporter.rerender();
    act(() => frames.shift()?.());
    act(() => frames.shift()?.());
    expect(reportContentReady).toHaveBeenCalledTimes(1);
    reporter.unmount();
  });
});
