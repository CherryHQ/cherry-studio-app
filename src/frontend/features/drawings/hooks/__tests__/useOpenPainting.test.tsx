import { router } from 'expo-router/build/global-state/router';
import { routingQueue } from 'expo-router/build/global-state/routingQueue';
import { storeRef } from 'expo-router/build/global-state/store';
import { getStateFromPath } from 'expo-router/build/react-navigation/native';
import { StackRouter } from 'expo-router/build/react-navigation/routers';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { paintingRouteId } from '@/frontend/appShell/navigation/paintingRoute';
import {
  consumePaintingDraftHandoff,
  createPaintingDraftHandoff,
} from '@/frontend/utils/paintingDraftHandoff';

import { useOpenPainting } from '../useOpenPainting';

let mockFocused = true;
let mockBlur: (() => void) | undefined;
const mockPush = jest.fn();
const mockNavigation = { isFocused: () => mockFocused };
const mockRouter = { push: (...args: unknown[]) => mockPush(...args) };
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      mockBlur = callback();
      return mockBlur;
    }, [callback]);
  },
}));
jest.mock('@/frontend/utils/paintingDraftHandoff', () => ({
  createPaintingDraftHandoff: jest.fn(() => 'handoff-1'),
  consumePaintingDraftHandoff: jest.fn(),
}));

let renderer: ReactTestRenderer | undefined;
let open!: ReturnType<typeof useOpenPainting>;
const originalStore = storeRef.current;
const routeOptions = {
  routeNames: ['drawings', 'paintings'],
  routeParamList: {},
  routeGetIdList: {
    paintings: ({ params }: { params?: Record<string, unknown> }) => paintingRouteId(params),
  },
};
function Probe() {
  const result = useOpenPainting();
  useEffect(() => {
    open = result;
  }, [result]);
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  routingQueue.queue = [];
  mockPush.mockImplementation(router.push);
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  storeRef.current = originalStore;
  routingQueue.queue = [];
});

function dispatchQueuedRoutes() {
  const stack = StackRouter({ initialRouteName: 'drawings' });
  let state = stack.getInitialState(routeOptions);
  const ref = {
    getRootState: () => state,
    dispatch: (action: Parameters<typeof stack.getStateForAction>[1]) => {
      const next = stack.getStateForAction(state, action, routeOptions);
      expect(next).not.toBeNull();
      state = stack.getRehydratedState(next!, routeOptions);
    },
  };
  storeRef.current = {
    navigationRef: { isReady: () => true, current: ref },
    linking: {
      getStateFromPath,
      config: { screens: { drawings: 'drawings', paintings: 'paintings' } },
    },
  } as unknown as typeof storeRef.current;
  routingQueue.run({ current: ref } as never);
  return state.routes.filter((route) => route.name === 'paintings');
}

it('admits only one blank canvas before the real Expo queue changes focus', () => {
  open();
  open();
  expect(routingQueue.queue).toHaveLength(1);
  expect(dispatchQueuedRoutes()).toHaveLength(1);
});
it('shares admission between header and template/photo entry points before creating a handoff', () => {
  const headerOpen = open;
  const listOpen = open;
  listOpen({ attachments: [], draft: 'draw' });
  headerOpen();
  listOpen({ attachments: [], draft: 'other' });
  expect(createPaintingDraftHandoff).toHaveBeenCalledTimes(1);
  expect(dispatchQueuedRoutes()).toMatchObject([{ params: { handoff: 'handoff-1' } }]);
});
it('rejects offscreen events and admits a new canvas after blur and return', () => {
  open();
  mockFocused = false;
  mockBlur?.();
  open();
  expect(mockPush).toHaveBeenCalledTimes(1);
  mockFocused = true;
  open();
  expect(mockPush).toHaveBeenCalledTimes(2);
});
it('cleans a failed handoff and lets the next press retry', () => {
  mockPush.mockImplementationOnce(() => {
    throw new Error('push failed');
  });
  expect(() => open({ attachments: [] })).toThrow('push failed');
  expect(consumePaintingDraftHandoff).toHaveBeenCalledWith('handoff-1');
  open();
  expect(dispatchQueuedRoutes()).toHaveLength(1);
});
