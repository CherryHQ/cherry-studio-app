import { useEffect } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { FoldRegionLayout, FoldRegionObserverProps } from '../../../../../modules/fold-region';
import { FoldRegionProvider, FoldRegionReporter } from '../../layout/FoldRegion';
import { usePaneSplit } from '../usePaneSplit';

let mockObserverProps: FoldRegionObserverProps;
let mockInsets = { left: 0, right: 0, top: 0, bottom: 0 };
let mockHasNativeObserver = true;
jest.mock('../../../../../modules/fold-region', () => ({
  get FoldRegionObserver() {
    return mockHasNativeObserver
      ? (props: FoldRegionObserverProps) => {
          mockObserverProps = props;
          return null;
        }
      : null;
  },
}));
jest.mock('@/frontend/appShell/layout', () => ({
  ...jest.requireActual('../../layout/FoldRegion'),
  ...jest.requireActual('../../layout/paneSplit'),
  ...jest.requireActual('../../layout/windowClass'),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));

let result: ReturnType<typeof usePaneSplit>;
const commits: ReturnType<typeof usePaneSplit>[] = [];
function Probe() {
  const current = usePaneSplit();
  useEffect(() => {
    result = current;
    commits.push(current);
  });
  return null;
}
let renderer: ReactTestRenderer;
beforeEach(() => {
  mockHasNativeObserver = true;
  mockInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  act(() => {
    renderer = create(
      <FoldRegionProvider>
        <FoldRegionReporter />
        <Probe />
      </FoldRegionProvider>,
    );
  });
  commits.length = 0;
});
afterEach(() => act(() => renderer.unmount()));

it('commits the host and fold from one event without an intermediate measured split', () => {
  const snapshot: FoldRegionLayout = {
    host: { x: 0, y: 30, width: 669, height: 921 },
    window: { width: 669, height: 951 },
    insets: { left: 0, right: 0 },
    fold: { x: 0, y: 485, width: 669, height: 40, isActive: true },
  };
  act(() => mockObserverProps.onLayoutChange(snapshot));
  expect(commits).toHaveLength(1);
  expect(result).toMatchObject({
    chatTop: 525,
    measure: undefined,
    split: { direction: 'column', paneSize: 455, chatOffset: 495 },
  });

  commits.length = 0;
  act(() =>
    mockObserverProps.onLayoutChange({
      host: { x: 0, y: 0, width: 951, height: 669 },
      window: { width: 951, height: 669 },
      insets: { left: 0, right: 20 },
      fold: { x: 455, y: 0, width: 40, height: 669, isActive: true },
    }),
  );
  expect(commits).toHaveLength(1);
  expect(result.split).toEqual({ direction: 'row', paneSize: 455, chatOffset: 495 });
});

it.each([
  ['iPad', 1440, 1160, 0, 0, 499],
  ['Android tablet', 1280, 1000, 0, 0, 430],
  ['asymmetric safe area', 1200, 920, 0, 32, 382],
] as const)(
  'preserves %s widths beside a 280-point sidebar',
  (_, windowWidth, width, left, right, expected) => {
    act(() =>
      mockObserverProps.onLayoutChange({
        host: { x: 280, y: 0, width, height: 900 },
        window: { width: windowWidth, height: 900 },
        insets: { left, right },
        fold: null,
      }),
    );
    expect(result.split.paneSize).toBe(expected);
  },
);

it('uses local onLayout size and safe areas without a native snapshot, ignoring parent coordinates', () => {
  mockHasNativeObserver = false;
  mockInsets = { left: 10, right: 20, top: 0, bottom: 0 };
  const event = {
    nativeEvent: { layout: { x: 280, y: 64, width: 1160, height: 800 } },
  } as LayoutChangeEvent;
  act(() => result.measure!(event));
  expect(result).toMatchObject({
    chatTop: null,
    isLayoutCurrent: true,
    split: { direction: 'row', paneSize: 486, chatOffset: 486 },
  });
  commits.length = 0;
  act(() => result.measure!(event));
  expect(commits).toHaveLength(0);
});

it('keeps an old screen snapshot hidden until its window dimensions agree', () => {
  // This harness uses the same window dimensions as the native hook under Jest.
  const dimensions = Dimensions.get('window');
  expect(result.isLayoutCurrent).toBe(false);
  const snapshot: FoldRegionLayout = {
    host: { x: 0, y: 0, width: dimensions.width, height: dimensions.height },
    insets: { left: 0, right: 0 },
    window: { width: dimensions.width, height: dimensions.height },
    fold: null,
  };
  act(() => mockObserverProps.onLayoutChange({ ...snapshot, window: { width: 466, height: 678 } }));
  expect(result.isLayoutCurrent).toBe(false);
  const split = result.split;
  act(() => mockObserverProps.onLayoutChange(snapshot));
  expect(result.isLayoutCurrent).toBe(true);
  expect(result.split).toEqual(split);
});
