import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useCloseDrawerForExternalNavigation } from '../useCloseDrawerForExternalNavigation';

let mockStatus: 'open' | 'closed' = 'open';
let mockProgress = 1;
let mockRead: () => { id: number; closed: boolean };
let mockReact: (state: ReturnType<typeof mockRead>) => void;
const mockCompletions: (() => void)[] = [];
const mockDrawerProgress = { get: () => mockProgress };

jest.mock('expo-router/drawer', () => ({
  getDrawerStatusFromState: (state: { status: string }) => state.status,
  useDrawerProgress: () => mockDrawerProgress,
  useDrawerStatus: () => mockStatus,
}));
jest.mock('react-native-reanimated', () => ({
  useSharedValue: (initial: number) => {
    const { useRef } = jest.requireActual('react');
    return useRef({
      value: initial,
      get() {
        return this.value;
      },
      set(value: number) {
        this.value = value;
      },
    }).current;
  },
  useAnimatedReaction: (read: typeof mockRead, react: typeof mockReact) => {
    mockRead = read;
    mockReact = react;
  },
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (id: number) => void, id: number) =>
    mockCompletions.push(() => callback(id)),
}));

const closeDrawer = jest.fn(() => {
  mockStatus = 'closed';
});
const addListener = jest.fn();
const navigation = {
  getState: () => ({ status: mockStatus }),
  closeDrawer,
  addListener,
} as unknown as DrawerContentComponentProps['navigation'];

let prepare: ReturnType<typeof useCloseDrawerForExternalNavigation>;
let renderer: ReactTestRenderer;
function Probe({ permanent = false }) {
  prepare = useCloseDrawerForExternalNavigation(navigation, permanent);
  return null;
}
function render(permanent = false) {
  act(() => {
    renderer = create(<Probe permanent={permanent} />);
  });
}
function progress(value: number) {
  mockProgress = value;
  mockReact(mockRead());
}
function flushCompletions() {
  act(() => mockCompletions.splice(0).forEach((complete) => complete()));
}
beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = 'open';
  mockProgress = 1;
  mockCompletions.length = 0;
});
afterEach(() => act(() => renderer?.unmount()));

test('waits for the drawer to finish closing without subscribing to parent navigation events', async () => {
  render();
  const settled = jest.fn();
  const ready = prepare(new AbortController().signal);
  void ready.then(settled);
  act(() => renderer.update(<Probe />));
  progress(0.5);
  flushCompletions();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  expect(closeDrawer).toHaveBeenCalledTimes(1);
  expect(addListener).not.toHaveBeenCalled();
  progress(0);
  flushCompletions();
  await expect(ready).resolves.toBe(true);
});

test.each(['reopen', 'abort', 'unmount'])('%s cancels a pending close', async (action) => {
  render();
  const controller = new AbortController();
  const ready = prepare(controller.signal);
  act(() => renderer.update(<Probe />));
  if (action === 'reopen') {
    mockStatus = 'open';
    act(() => renderer.update(<Probe />));
  } else if (action === 'abort') controller.abort();
  else act(() => renderer.unmount());
  progress(0);
  flushCompletions();
  await expect(ready).resolves.toBe(false);
});

test('an earlier queued completion cannot finish the next request', async () => {
  render();
  const controller = new AbortController();
  const previous = prepare(controller.signal);
  progress(0);
  mockProgress = 0.5;
  const next = prepare(new AbortController().signal);
  const settled = jest.fn();
  void next.then(settled);
  controller.abort();
  flushCompletions();
  await expect(previous).resolves.toBe(false);
  expect(settled).not.toHaveBeenCalled();
  progress(0);
  flushCompletions();
  await expect(next).resolves.toBe(true);
});

test.each([false, true])(
  'an already closed or permanent=%s drawer is ready immediately',
  async (permanent) => {
    if (!permanent) {
      mockStatus = 'closed';
      mockProgress = 0;
    }
    render(permanent);
    await expect(prepare(new AbortController().signal)).resolves.toBe(true);
    expect(closeDrawer).not.toHaveBeenCalled();
  },
);

test('an already-aborted request leaves the drawer alone', async () => {
  render();
  const controller = new AbortController();
  controller.abort();
  await expect(prepare(controller.signal)).resolves.toBe(false);
  expect(closeDrawer).not.toHaveBeenCalled();
});
