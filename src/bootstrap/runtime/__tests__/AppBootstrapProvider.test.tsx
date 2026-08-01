import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { PreferenceClient } from '@cherrystudio/universal/data/preference';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppBootstrapRuntime } from '@/bootstrap/runtime/createAppBootstrapRuntime';
import type { Backend } from '@/shared/contracts';

import { AppBootstrapGate } from '../AppBootstrapGate';
import { AppBootstrapProvider, useAppBootstrapState } from '../AppBootstrapProvider';

const mockPreventAutoHide = jest.fn(async () => undefined);
const mockHideAsync = jest.fn(async () => undefined);

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => mockPreventAutoHide(),
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

beforeEach(() => {
  mockPreventAutoHide.mockClear();
  mockHideAsync.mockClear();
});

describe('AppBootstrapProvider startup gate', () => {
  test('holds the gate closed (renders null) while the runtime initializes', async () => {
    // init never settles: the gate must stay closed and the splash must remain up.
    const { runtime } = makeRuntime(() => new Promise<void>(() => {}));
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <AppBootstrapProvider createRuntime={() => runtime}>
          <AppBootstrapGate>
            <Text>gate-open</Text>
          </AppBootstrapGate>
        </AppBootstrapProvider>,
      );
    });

    expect(renderer && hasText(renderer, 'gate-open')).toBe(false);
    expect(mockHideAsync).not.toHaveBeenCalled();

    await act(async () => renderer?.unmount());
  });

  test('opens the gate, hides the splash, and fires post-ready tasks once ready', async () => {
    const { dispose, initialize, runPostReadyTasks, runtime } = makeRuntime(async () => undefined);
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <AppBootstrapProvider createRuntime={() => runtime}>
          <AppBootstrapGate>
            <Text>gate-open</Text>
          </AppBootstrapGate>
        </AppBootstrapProvider>,
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'gate-open')).toBe(true);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(runPostReadyTasks).toHaveBeenCalledTimes(1);
    // Post-ready work runs after initialization, never before the gate opens.
    expect(initialize.mock.invocationCallOrder[0]).toBeLessThan(
      runPostReadyTasks.mock.invocationCallOrder[0],
    );

    await act(async () => renderer?.unmount());
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('hides the splash and surfaces the error without running post-ready tasks', async () => {
    const { runPostReadyTasks, runtime } = makeRuntime(async () => {
      throw new Error('init failed');
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <AppBootstrapProvider createRuntime={() => runtime}>
          <StatusProbe />
        </AppBootstrapProvider>,
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'status:error')).toBe(true);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(runPostReadyTasks).not.toHaveBeenCalled();

    await act(async () => renderer?.unmount());
  });
});
