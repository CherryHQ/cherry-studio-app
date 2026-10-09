import { loggerService } from '@logger';
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';

import {
  type AppBootstrapRuntime,
  createAppBootstrapRuntime,
} from '@/bootstrap/runtime/createAppBootstrapRuntime';
import { recordSentryBreadcrumb } from '@/frontend/appShell/observability';
import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { FileQueryBridge } from '@/frontend/data/FileQueryBridge';
import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import { ProviderRegistryQueryBridge } from '@/frontend/data/ProviderRegistryQueryBridge';
import i18n, { initI18n } from '@/frontend/i18n';

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
      /** Starts again with a new runtime; a host that failed to start cannot restart. */
      retry: () => void;
      status: 'error';
    };

const AppBootstrapContext = createContext<AppBootstrapState | null>(null);
const logger = loggerService.withContext('AppBootstrap');

export function AppBootstrapProvider({ children, createRuntime }: AppBootstrapProviderProps) {
  // Runtime identity is owned state, not a memoization guarantee. The Compiler
  // can cache a factory call independently of an unused retry counter.
  const [attempt, setAttempt] = useState(() => ({
    createRuntime,
    runtime: (createRuntime ?? createAppBootstrapRuntime)(),
  }));
  let { runtime } = attempt;
  if (attempt.createRuntime !== createRuntime) {
    runtime = (createRuntime ?? createAppBootstrapRuntime)();
    setAttempt({ createRuntime, runtime });
  }
  const [state, setState] = useState<AppBootstrapState>({ status: 'loading' });

  useEffect(() => {
    let disposed = false;

    void initializeApp({
      isDisposed: () => disposed,
      retry: () => {
        // Ignore repeated taps before the next attempt commits.
        if (disposed) return;
        disposed = true;
        setState({ status: 'loading' });
        setAttempt({ createRuntime, runtime: (createRuntime ?? createAppBootstrapRuntime)() });
      },
      runtime,
      setState,
    });

    return () => {
      disposed = true;
      void runtime.dispose();
    };
  }, [createRuntime, runtime]);

  return (
    <BackendProvider backend={runtime.backend}>
      <DataApiProvider dataApi={runtime.dataApi}>
        <FileQueryBridge />
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
  retry,
  runtime,
  setState,
}: {
  isDisposed: () => boolean;
  retry: () => void;
  runtime: AppBootstrapRuntime;
  setState: (state: AppBootstrapState) => void;
}) {
  try {
    recordSentryBreadcrumb('startup.bootstrap');
    await runtime.initialize();

    if (!isDisposed()) {
      recordSentryBreadcrumb('startup.ready');
      setState({ status: 'ready' });
      // Off the startup critical path: fire once the gate opens.
      void runtime.runPostReadyTasks();
    }
  } catch (error) {
    if (!isDisposed()) {
      recordSentryBreadcrumb('startup.failed');
      logger.error('Application initialization failed', toError(error), {
        operation: 'app.initialize',
      });
      // The failure screen is translated; failures before the i18n step leave it uninitialized.
      if (!i18n.isInitialized) await initI18n().catch(() => undefined);
      if (!isDisposed()) setState({ error: toError(error), retry, status: 'error' });
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
