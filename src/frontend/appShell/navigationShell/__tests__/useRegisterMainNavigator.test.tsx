import { StackActions } from 'expo-router/react-navigation';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  type MainNavigatorHandler,
  NavigationShellContext,
  type NavigationShellContextValue,
} from '../state';
import {
  type MainStackNavigationLike,
  useRegisterMainNavigator,
} from '../useRegisterMainNavigator';

const mockDispatch = jest.fn();
let mockState: ReturnType<MainStackNavigationLike['getState']>;
let registeredHandler: MainNavigatorHandler | null = null;

function Harness({ navigation }: { navigation: MainStackNavigationLike }) {
  useRegisterMainNavigator(navigation);
  return null;
}

describe('useRegisterMainNavigator', () => {
  let renderer: ReactTestRenderer;
  const shellValue = {
    registerMainNavigator: (handler: MainNavigatorHandler | null) => {
      registeredHandler = handler;
    },
  } as unknown as NavigationShellContextValue;

  const navigation: MainStackNavigationLike = {
    dispatch: mockDispatch,
    getState: () => mockState,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandler = null;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('targets the nested (main) stack state when navigation resolves to parent drawer', () => {
    mockState = {
      index: 0,
      key: 'drawer-1',
      routeNames: ['(main)'],
      routes: [
        {
          key: 'main-route',
          name: '(main)',
          state: {
            index: 0,
            key: 'stack-main',
            routeNames: ['(chat)', 'library'],
            routes: [{ key: 'chat-key', name: '(chat)' }],
            stale: false,
            type: 'stack',
          },
        },
      ],
      stale: false,
      type: 'drawer',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellContext value={shellValue}>
          <Harness navigation={navigation} />
        </NavigationShellContext>,
      );
    });

    expect(registeredHandler).not.toBeNull();
    expect(registeredHandler?.('files')).toBe('push');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('returns false when (main) nested stack state is not yet mounted', () => {
    mockState = {
      index: 0,
      key: 'drawer-1',
      routeNames: ['(main)'],
      routes: [{ key: 'main-route', name: '(main)' }],
      stale: false,
      type: 'drawer',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellContext value={shellValue}>
          <Harness navigation={navigation} />
        </NavigationShellContext>,
      );
    });

    expect(registeredHandler?.('files')).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('replaces top route at depth 1 and pops child stack when re-tapping active tab', () => {
    mockState = {
      index: 0,
      key: 'drawer-1',
      routeNames: ['(main)'],
      routes: [
        {
          key: 'main-route',
          name: '(main)',
          state: {
            index: 1,
            key: 'stack-main',
            routeNames: ['(chat)', 'agents', 'skills'],
            routes: [
              { key: 'chat-key', name: '(chat)' },
              {
                key: 'agents-key',
                name: 'agents',
                state: {
                  index: 1,
                  key: 'stack-agents',
                  routeNames: ['index', '[agentId]/edit'],
                  routes: [
                    { key: 'agents-idx', name: 'index' },
                    { key: 'agents-edit', name: '[agentId]/edit' },
                  ],
                  stale: false,
                  type: 'stack',
                },
              },
            ],
            stale: false,
            type: 'stack',
          },
        },
      ],
      stale: false,
      type: 'drawer',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellContext value={shellValue}>
          <Harness navigation={navigation} />
        </NavigationShellContext>,
      );
    });

    expect(registeredHandler?.('agents')).toBe('handled');
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-agents',
    });

    mockDispatch.mockClear();
    expect(registeredHandler?.('marketplace')).toBe('replace');
    expect(mockDispatch).not.toHaveBeenCalled();

    mockDispatch.mockClear();
    expect(registeredHandler?.('chat')).toBe('handled');
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-main',
    });
  });

  it('pops extra child depth before replacing when switching roots from depth 2', () => {
    mockState = {
      index: 2,
      key: 'stack-main',
      routeNames: ['(chat)', 'more', 'library'],
      routes: [
        { key: 'chat-key', name: '(chat)' },
        { key: 'more-key', name: 'more' },
        { key: 'lib-key', name: 'library' },
      ],
      stale: false,
      type: 'stack',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellContext value={shellValue}>
          <Harness navigation={navigation} />
        </NavigationShellContext>,
      );
    });

    expect(registeredHandler?.('plugins')).toBe('replace');
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.pop(1),
      target: 'stack-main',
    });

    mockDispatch.mockClear();
    expect(registeredHandler?.('more')).toEqual({ action: 'dismiss', count: 1 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
