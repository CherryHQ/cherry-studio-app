import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppBootstrapRuntime } from '@/bootstrap/runtime/createAppBootstrapRuntime';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { PreferenceClient } from '@/shared/data/preference';

import { AppBootstrapGate } from '../AppBootstrapGate';
import { AppBootstrapProvider, useAppBootstrapState } from '../AppBootstrapProvider';

const mockHideAsync = jest.fn(async () => undefined);

jest.mock('expo-splash-screen', () => ({
  hideAsync: () => mockHideAsync(),
}));

// The injected runtime keeps native SQLite and the concrete backend graph out
// of this provider-level test.
jest.mock('@/bootstrap/runtime/createAppBootstrapRuntime', () => ({
  createAppBootstrapRuntime: jest.fn(),
}));

function makeRuntime(initializeImplementation: () => Promise<void>): {
  dispose: jest.Mock;
  initialize: jest.Mock;
  runPostReadyTasks: jest.Mock;
  runtime: AppBootstrapRuntime;
} {
  const dispose = jest.fn(async () => undefined);
  const initialize = jest.fn(initializeImplementation);
  const runPostReadyTasks = jest.fn(async () => undefined);

  return {
    dispose,
    initialize,
    runPostReadyTasks,
    runtime: {
      backend: {} as Backend,
      dataApi: {} as ApiClient,
      preference: {} as PreferenceClient,
      dispose,
      initialize,
      runPostReadyTasks,
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function hasText(renderer: ReactTestRenderer, value: string) {
  return renderer.root.findAllByType(Text).some((node) => node.props.children === value);
}

function StatusProbe() {
  const state = useAppBootstrapState();
  return <Text>{`status:${state.status}`}</Text>;
}

function withQueryClient(children: ReactElement) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockHideAsync.mockClear();
});

describe('AppBootstrapProvider startup gate', () => {
  test('holds the gate closed (renders null) while the runtime initializes', async () => {
    // Initialization state is this provider's only startup responsibility.
    const { runtime } = makeRuntime(() => new Promise<void>(() => {}));
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        withQueryClient(
          <AppBootstrapProvider createRuntime={() => runtime}>
            <AppBootstrapGate>
              <Text>gate-open</Text>
            </AppBootstrapGate>
          </AppBootstrapProvider>,
        ),
      );
    });

    expect(renderer && hasText(renderer, 'gate-open')).toBe(false);
    expect(mockHideAsync).not.toHaveBeenCalled();

    await act(async () => renderer?.unmount());
  });

  test('opens the gate and fires post-ready tasks without owning the native splash', async () => {
    const { dispose, initialize, runPostReadyTasks, runtime } = makeRuntime(async () => undefined);
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        withQueryClient(
          <AppBootstrapProvider createRuntime={() => runtime}>
            <AppBootstrapGate>
              <Text>gate-open</Text>
            </AppBootstrapGate>
          </AppBootstrapProvider>,
        ),
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'gate-open')).toBe(true);
    expect(mockHideAsync).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(runPostReadyTasks).toHaveBeenCalledTimes(1);
    // Post-ready work runs after initialization, never before the gate opens.
    expect(initialize.mock.invocationCallOrder[0]).toBeLessThan(
      runPostReadyTasks.mock.invocationCallOrder[0],
    );

    await act(async () => renderer?.unmount());
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('surfaces the error without hiding the splash or running post-ready tasks', async () => {
    const { runPostReadyTasks, runtime } = makeRuntime(async () => {
      throw new Error('init failed');
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        withQueryClient(
          <AppBootstrapProvider createRuntime={() => runtime}>
            <StatusProbe />
          </AppBootstrapProvider>,
        ),
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'status:error')).toBe(true);
    expect(mockHideAsync).not.toHaveBeenCalled();
    expect(runPostReadyTasks).not.toHaveBeenCalled();

    await act(async () => renderer?.unmount());
  });
});
