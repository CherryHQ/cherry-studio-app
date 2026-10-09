import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { isBackgroundTaskVisible } from '../foregroundActivityAttention';
import { useBackgroundTaskNotifications } from '../useBackgroundTaskNotifications/useBackgroundTaskNotifications';

let mockFocused = true;
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const task = { kind: 'chat', sessionId: 's' } as const;
let renderer: ReactTestRenderer | undefined;

jest.mock('expo-linking', () => ({ resolveScheme: () => 'cherrystudio' }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));

function Probe({ enabled = true }: { enabled?: boolean }) {
  useBackgroundTaskNotifications(task, enabled);
  return null;
}

beforeEach(() => {
  mockFocused = true;
  setAppState('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});

test('reports the task only while its screen is focused and the app is in the foreground', () => {
  act(() => {
    renderer = create(<Probe />);
  });
  expect(isBackgroundTaskVisible(task)).toBe(true);

  act(() => setAppState('background'));
  expect(isBackgroundTaskVisible(task)).toBe(false);
  act(() => setAppState('active'));
  expect(isBackgroundTaskVisible(task)).toBe(true);

  mockFocused = false;
  act(() => renderer?.update(<Probe />));
  expect(isBackgroundTaskVisible(task)).toBe(false);
  expect(appStateListeners.size).toBe(0);
});

test('a drawer-covered surface does not report its task', () => {
  act(() => {
    renderer = create(<Probe enabled={false} />);
  });
  expect(isBackgroundTaskVisible(task)).toBe(false);
});

function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  for (const listener of appStateListeners) listener(state);
}
