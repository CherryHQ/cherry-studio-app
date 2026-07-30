import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { runPostReadyTasks } from '@/bootstrap/appRuntime';
import type { DataServices } from '@/bootstrap/createDataServices';
import type { MobileBackend } from '@/shared/contracts';

import { DataProvider, type DataRuntime, useDataState } from '../DataProvider';
import { InitialDataGate } from '../InitialDataGate';

const mockPreventAutoHide = jest.fn(async () => undefined);
const mockHideAsync = jest.fn(async () => undefined);

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => mockPreventAutoHide(),
  hideAsync: () => mockHideAsync(),
}));

// The seam under test injects the runtime, so the real DbService / service graph
// (and their native + ai-core dependencies) never load here.
jest.mock('@/backend/infrastructure/db/DbService', () => ({
  DbService: class {
    init = jest.fn(async () => undefined);
    dispose = jest.fn(() => undefined);
  },
}));

jest.mock('@/bootstrap/createDataServices', () => ({
  createDataServices: jest.fn(),
}));

jest.mock('@/bootstrap/createMobileBackend', () => ({
  createMobileBackend: jest.fn(),
}));

jest.mock('@/bootstrap/appRuntime', () => ({
  runPostReadyTasks: jest.fn(async () => undefined),
}));

const runPostReadyTasksMock = runPostReadyTasks as jest.Mock;

function makeRuntime(init: () => Promise<void>): {
  runtime: DataRuntime;
  dispose: jest.Mock;
  preferenceInit: jest.Mock;
  services: DataServices;
} {
  const dispose = jest.fn();
  const preferenceInit = jest.fn(async () => undefined);
  const webSearchDispose = jest.fn();
  const services = {
    preference: { init: preferenceInit },
    webSearch: { dispose: webSearchDispose },
  } as unknown as DataServices;

  return {
    dispose,
    preferenceInit,
    runtime: {
      backend: {} as MobileBackend,
      dbService: { init, dispose },
      services,
    },
    services,
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
  const state = useDataState();
  return <Text>{`status:${state.status}`}</Text>;
}

beforeEach(() => {
  mockPreventAutoHide.mockClear();
  mockHideAsync.mockClear();
  runPostReadyTasksMock.mockClear();
});

describe('DataProvider startup gate', () => {
  test('holds the gate closed (renders null) while the runtime initializes', async () => {
    // init never settles: the gate must stay closed and the splash must remain up.
    const { runtime } = makeRuntime(() => new Promise<void>(() => {}));
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <DataProvider bootstrap={jest.fn()} createRuntime={() => runtime}>
          <InitialDataGate>
            <Text>gate-open</Text>
          </InitialDataGate>
        </DataProvider>,
      );
    });

    expect(renderer && hasText(renderer, 'gate-open')).toBe(false);
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  test('opens the gate, hides the splash, and fires post-ready tasks once ready', async () => {
    const bootstrap = jest.fn(async () => undefined);
    const { runtime, services } = makeRuntime(async () => undefined);
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <DataProvider bootstrap={bootstrap} createRuntime={() => runtime}>
          <InitialDataGate>
            <Text>gate-open</Text>
          </InitialDataGate>
        </DataProvider>,
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'gate-open')).toBe(true);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledWith(services);
    expect(runPostReadyTasksMock).toHaveBeenCalledWith(services);
    // Post-ready work runs after bootstrap, never before the gate opens.
    expect(bootstrap.mock.invocationCallOrder[0]).toBeLessThan(
      runPostReadyTasksMock.mock.invocationCallOrder[0],
    );
  });

  test('hides the splash and surfaces the error without running post-ready tasks', async () => {
    const { runtime } = makeRuntime(async () => {
      throw new Error('init failed');
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <DataProvider bootstrap={jest.fn()} createRuntime={() => runtime}>
          <StatusProbe />
        </DataProvider>,
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'status:error')).toBe(true);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(runPostReadyTasksMock).not.toHaveBeenCalled();
  });
});
