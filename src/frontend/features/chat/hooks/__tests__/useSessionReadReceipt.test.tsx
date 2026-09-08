import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSessionReadReceipt } from '../useSessionReadReceipt';

let mockFocused = true;
let mockDrawerStatus = 'closed';
let mockMarkSeen = jest.fn();
const appStateListeners = new Set<(state: AppStateStatus) => void>();
let renderer: ReactTestRenderer | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const isFocused = mockFocused;
    useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
  },
}));

jest.mock('expo-router/drawer', () => ({ useDrawerStatus: () => mockDrawerStatus }));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSessionStatus: () => ({ markSeen: mockMarkSeen }),
}));

function Probe() {
  useSessionReadReceipt('session-1');
  return null;
}

function changeAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  act(() => appStateListeners.forEach((listener) => listener(state)));
}

beforeEach(() => {
  mockFocused = true;
  mockDrawerStatus = 'closed';
  mockMarkSeen = jest.fn();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  appStateListeners.clear();
  jest.restoreAllMocks();
});

test('acknowledges on opening the chat and when another reply completes while it remains visible', () => {
  act(() => {
    renderer = create(<Probe />);
  });
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);

  mockMarkSeen = jest.fn();
  act(() => renderer?.update(<Probe />));
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
});

test('keeps background completions unread until the app returns and releases the listener on blur', () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  act(() => {
    renderer = create(<Probe />);
  });
  expect(mockMarkSeen).not.toHaveBeenCalled();

  changeAppState('inactive');
  expect(mockMarkSeen).not.toHaveBeenCalled();
  changeAppState('active');
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);

  mockFocused = false;
  act(() => renderer?.update(<Probe />));
  expect(appStateListeners.size).toBe(0);
  changeAppState('active');
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
});

test('does not acknowledge behind the drawer or another route, then acknowledges on returning to the chat', () => {
  mockDrawerStatus = 'open';
  act(() => {
    renderer = create(<Probe />);
  });
  expect(mockMarkSeen).not.toHaveBeenCalled();
  expect(appStateListeners.size).toBe(0);

  mockDrawerStatus = 'closed';
  mockFocused = false;
  act(() => renderer?.update(<Probe />));
  expect(mockMarkSeen).not.toHaveBeenCalled();

  mockFocused = true;
  act(() => renderer?.update(<Probe />));
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
});
