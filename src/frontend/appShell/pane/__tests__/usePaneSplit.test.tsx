import { useEffect } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';
import type { ReservedRegion } from 'react-native-reserved-regions';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FoldRegionProvider, FoldRegionReporter } from '../../layout/FoldRegion';
import { usePaneSplit } from '../usePaneSplit';

type Size = { width: number; height: number };
let mockInsets = { left: 0, right: 0, top: 0, bottom: 0 };
let mockMounts = 0;
let mockLayoutHost: (size: Size) => void;
let mockReportRegions: (regions: ReservedRegion[]) => void;

// A provider that reports its layout and regions on demand, as the native view does.
jest.mock('react-native-reserved-regions', () => {
  const { createContext, createElement, use, useEffect, useState } = jest.requireActual('react');
  const Snapshot = createContext(null);
  return {
    ReservedRegionsProvider({
      children,
      onLayout,
    }: {
      children: unknown;
      onLayout: (event: LayoutChangeEvent) => void;
    }) {
      const [snapshot, setSnapshot] = useState({ isReady: false, regions: [] });
      useEffect(() => {
        mockMounts += 1;
      }, []);
      mockLayoutHost = (size: Size) => onLayout({ nativeEvent: { layout: size } } as never);
      mockReportRegions = (regions: ReservedRegion[]) => setSnapshot({ isReady: true, regions });
      return createElement(Snapshot, { value: snapshot }, children);
    },
    useReservedRegions: () => use(Snapshot).regions,
    useReservedRegionsReady: () => use(Snapshot).isReady,
  };
});
jest.mock('@/frontend/appShell/layout', () => ({
  ...jest.requireActual('../../layout/FoldRegion'),
  ...jest.requireActual('../../layout/paneSplit'),
  ...jest.requireActual('../../layout/windowClass'),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));

const division = (frame: ReservedRegion['frame']): ReservedRegion => ({
  frame,
  kind: 'division',
  occludesContent: false,
});

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
// Dimensions notifies subscribers, as a window resize does.
function resizeWindow({ width, height }: Size) {
  act(() =>
    Dimensions.set({
      screen: { fontScale: 1, height, scale: 3, width },
      window: { fontScale: 1, height, scale: 3, width },
    }),
  );
}
let renderer: ReactTestRenderer;
beforeEach(() => {
  mockInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  mockMounts = 0;
  resizeWindow({ width: 951, height: 669 });
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

it('commits the host and fold together once the regions are measured', () => {
  act(() => mockLayoutHost({ width: 951, height: 669 }));
  expect(commits).toHaveLength(0);

  act(() => mockReportRegions([division({ x: 455, y: 0, width: 40, height: 669 })]));
  expect(commits).toHaveLength(1);
  expect(result).toMatchObject({
    chatTop: null,
    isLayoutCurrent: true,
    split: { direction: 'row', paneSize: 455, chatOffset: 495 },
  });
});

it('stacks the pane across an upright fold, with the chat below it in window points', () => {
  resizeWindow({ width: 669, height: 951 });
  act(() => mockLayoutHost({ width: 669, height: 951 }));
  act(() => mockReportRegions([division({ x: 0, y: 455, width: 669, height: 40 })]));
  expect(result).toMatchObject({
    chatTop: 495,
    split: { direction: 'column', paneSize: 455, chatOffset: 495 },
  });
});

it.each([
  ['iPad', 1160, 0, 0, 499],
  ['Android tablet', 1000, 0, 0, 430],
  ['asymmetric safe area', 920, 0, 32, 382],
] as const)('preserves %s widths beside a 280-point sidebar', (_, width, left, right, expected) => {
  mockInsets = { left, right, top: 0, bottom: 0 };
  act(() => mockLayoutHost({ width, height: 900 }));
  act(() => mockReportRegions([]));
  expect(result.split.paneSize).toBe(expected);
});

it('reserves no space until the first snapshot', () => {
  expect(result.isLayoutCurrent).toBe(false);
  act(() => mockLayoutHost({ width: 951, height: 669 }));
  expect(result.isLayoutCurrent).toBe(false);
});

it('observes a resized window afresh and keeps the old snapshot until then', () => {
  act(() => mockLayoutHost({ width: 951, height: 669 }));
  act(() => mockReportRegions([division({ x: 455, y: 0, width: 40, height: 669 })]));
  const split = result.split;
  expect(mockMounts).toBe(1);

  // Closing the device: the outer display's window before its regions arrive.
  resizeWindow({ width: 466, height: 678 });
  expect(mockMounts).toBe(2);
  expect(result.isLayoutCurrent).toBe(false);
  expect(result.split).toEqual(split);

  act(() => mockLayoutHost({ width: 466, height: 678 }));
  act(() => mockReportRegions([]));
  expect(result.isLayoutCurrent).toBe(true);
  expect(result.split).toEqual({ direction: 'row', paneSize: 360, chatOffset: 360 });
});
