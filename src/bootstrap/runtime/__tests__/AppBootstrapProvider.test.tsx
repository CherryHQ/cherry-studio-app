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

// Jest normally skips the production React Compiler. Exercise the provider after
// compilation so a cached runtime factory cannot silently break startup retry.
jest.mock('../AppBootstrapProvider', () => {
  const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
  const { createRequire } = jest.requireActual<typeof import('node:module')>('node:module');
  const load = createRequire(require.resolve('babel-preset-expo'));
  const filename = require.resolve('../AppBootstrapProvider');
  const { code } = load('@babel/core').transformSync(readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [[load('babel-plugin-react-compiler'), { target: '19' }]],
    presets: [[require.resolve('babel-preset-expo'), { reactCompiler: false }]],
  });
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports);
  return compiled.exports;
});

const mockHideAsync = jest.fn(async () => undefined);

jest.mock('expo-splash-screen', () => ({
  hideAsync: () => mockHideAsync(),
}));

jest.mock('@/frontend/appShell/observability', () => ({ recordSentryBreadcrumb: jest.fn() }));
// The restart screen's startup reporter pulls in native animation modules.
jest.mock('@/frontend/appShell/backup', () => ({ RestoreRestartScreen: () => null }));
jest.mock('@/frontend/appShell/recovery', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    StartupFailureScreen: ({ onRetry }: { onRetry: () => void }) => (
      <Text onPress={onRetry}>startup-failed</Text>
    ),
  };
});

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
  const backupState = { phase: 'idle', completed: 0, total: 0 };

  return {
    dispose,
    initialize,
    runPostReadyTasks,
    runtime: {
      backend: {
        file: { subscribeChanges: () => () => {} },
        skills: { subscribeChanges: () => () => {} },
        backup: { getState: () => backupState, subscribe: () => () => {} },
      } as unknown as Backend,
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

  test('shows the startup failure screen instead of throwing, and retry starts a new runtime', async () => {
    const failed = makeRuntime(async () => {
      throw new Error('migration failed');
    });
    const next = makeRuntime(async () => undefined);
    const createRuntime = jest
      .fn<AppBootstrapRuntime, []>()
      .mockReturnValueOnce(failed.runtime)
      .mockReturnValueOnce(next.runtime);
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        withQueryClient(
          <AppBootstrapProvider createRuntime={createRuntime}>
            <AppBootstrapGate>
              <Text>gate-open</Text>
            </AppBootstrapGate>
          </AppBootstrapProvider>,
        ),
      );
    });
    await flush();

    expect(renderer && hasText(renderer, 'startup-failed')).toBe(true);
    expect(failed.runPostReadyTasks).not.toHaveBeenCalled();

    const retry = renderer!.root
      .findAllByType(Text)
      .find((node) => node.props.children === 'startup-failed');
    await act(async () => {
      retry?.props.onPress();
      retry?.props.onPress();
    });
    expect(createRuntime).toHaveBeenCalledTimes(2);
    await flush();

    // The failed host cannot start again: it is disposed and a new runtime initializes.
    expect(failed.dispose).toHaveBeenCalledTimes(1);
    expect(failed.initialize).toHaveBeenCalledTimes(1);
    expect(next.initialize).toHaveBeenCalledTimes(1);
    expect(next.runPostReadyTasks).toHaveBeenCalledTimes(1);
    expect(renderer && hasText(renderer, 'gate-open')).toBe(true);

    await act(async () => renderer?.unmount());
    expect(next.dispose).toHaveBeenCalledTimes(1);
  });
});
