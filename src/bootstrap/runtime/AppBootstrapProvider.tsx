import { createContext, type PropsWithChildren, use, useEffect, useMemo, useState } from 'react';

import {
  type AppBootstrapRuntime,
  createAppBootstrapRuntime,
} from '@/bootstrap/runtime/createAppBootstrapRuntime';
import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import { ProviderRegistryQueryBridge } from '@/frontend/data/ProviderRegistryQueryBridge';

type AppBootstrapProviderProps = PropsWithChildren<{
  /** Test seam. Production owns one in-process backend runtime. */
  createRuntime?: () => AppBootstrapRuntime;
}>;

type AppBootstrapState =
  | {
      error?: never;
      status: 'loading';
    }
  | {
      error?: never;
      status: 'ready';
    }
  | {
      error: Error;
      status: 'error';
    };

const AppBootstrapContext = createContext<AppBootstrapState | null>(null);

export function AppBootstrapProvider({ children, createRuntime }: AppBootstrapProviderProps) {
  const runtime = useMemo(() => (createRuntime ?? createAppBootstrapRuntime)(), [createRuntime]);
  const [state, setState] = useState<AppBootstrapState>({ status: 'loading' });

  useEffect(() => {
    let disposed = false;

    void initializeApp({
      isDisposed: () => disposed,
      runtime,
      setState,
    });

    return () => {
      disposed = true;
      void runtime.dispose();
    };
  }, [runtime]);

  return (
    <BackendProvider backend={runtime.backend}>
      <DataApiProvider dataApi={runtime.dataApi}>
        <ProviderRegistryQueryBridge />
        <PreferenceProvider preference={runtime.preference}>
          <AppBootstrapContext value={state}>{children}</AppBootstrapContext>
        </PreferenceProvider>
      </DataApiProvider>
    </BackendProvider>
  );
}

// 模块级函数：try/finally 会让 React Compiler 对组件 bail out，故初始化流程放在组件体外。
async function initializeApp({
  isDisposed,
  runtime,
  setState,
}: {
  isDisposed: () => boolean;
  runtime: AppBootstrapRuntime;
  setState: (state: AppBootstrapState) => void;
}) {
  try {
    await runtime.initialize();

    if (!isDisposed()) {
      setState({ status: 'ready' });
      // Off the startup critical path: fire once the gate opens.
      void runtime.runPostReadyTasks();
    }
  } catch (error) {
    if (!isDisposed()) {
      setState({ error: toError(error), status: 'error' });
    }
  }
}

export function useAppBootstrapState() {
  const state = use(AppBootstrapContext);

  if (!state) {
    throw new Error('useAppBootstrapState must be used within AppBootstrapProvider');
  }

  return state;
}

function toError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
