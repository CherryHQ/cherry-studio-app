import { loggerService } from '@logger';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  type AppBootstrapRuntime,
  createAppBootstrapRuntime,
} from '@/bootstrap/runtime/createAppBootstrapRuntime';
import { recordSentryBreadcrumb } from '@/frontend/appShell/observability';
import { BackendProvider } from '@/frontend/data/BackendProvider';
import { cacheService } from '@/frontend/data/CacheService';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import { ProviderRegistryQueryBridge } from '@/frontend/data/ProviderRegistryQueryBridge';
import { SkillQueryBridge } from '@/frontend/data/SkillQueryBridge';
import i18n, { initI18n } from '@/frontend/i18n';
import { startStartupStage } from '@/shared/core/logger/startupDiagnostics';
import type { ApiClient } from '@/shared/data/api/types';

type AppBootstrapProviderProps = PropsWithChildren<{
  /** Test seam. Production owns one in-process backend runtime. */
  createRuntime?: () => AppBootstrapRuntime;
  /** Defer PostReady tasks until initial startup content has dismissed the splash cover. */
  deferPostReady?: boolean;
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
const AppBootstrapPostReadyContext = createContext<(() => void) | null>(null);
const logger = loggerService.withContext('AppBootstrap');

function startPostReadyOnce(runtime: AppBootstrapRuntime, started: WeakSet<AppBootstrapRuntime>) {
  if (started.has(runtime)) return;
  started.add(runtime);
  void runtime.runPostReadyTasks();
}

function prefetchLastChatAgent(queryClient: QueryClient, dataApi: ApiClient | undefined) {
  if (typeof dataApi?.get !== 'function') return;
  const lastAgentId = cacheService.getPersist('chat.last_agent_id');
  if (!lastAgentId) return;
  const path = `/agents/${lastAgentId}` as `/agents/${string}`;
  void queryClient
    .prefetchQuery({
      queryKey: [path],
      queryFn: () => dataApi.get(path),
    })
    .catch(() => undefined);
}

export function AppBootstrapProvider({
  children,
  createRuntime,
  deferPostReady = false,
}: AppBootstrapProviderProps) {
  const queryClient = useQueryClient();
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
  const activeRuntimeRef = useRef<AppBootstrapRuntime | null>(null);
  const readyRuntimeRef = useRef<AppBootstrapRuntime | null>(null);
  const startedPostReadyRef = useRef(new WeakSet<AppBootstrapRuntime>());
  const deferPostReadyRef = useRef(deferPostReady);

  useEffect(() => {
    deferPostReadyRef.current = deferPostReady;
    if (
      !deferPostReady &&
      readyRuntimeRef.current &&
      readyRuntimeRef.current === activeRuntimeRef.current
    ) {
      startPostReadyOnce(readyRuntimeRef.current, startedPostReadyRef.current);
    }
  }, [deferPostReady]);

  const startPostReady = useCallback(() => {
    const current = readyRuntimeRef.current;
    if (current && current === activeRuntimeRef.current) {
      startPostReadyOnce(current, startedPostReadyRef.current);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    activeRuntimeRef.current = runtime;
    readyRuntimeRef.current = null;

    void initializeApp({
      isDisposed: () => disposed,
      onReady: () => {
        readyRuntimeRef.current = runtime;
        if (!deferPostReadyRef.current) {
          startPostReadyOnce(runtime, startedPostReadyRef.current);
        }
      },
      queryClient,
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
      if (activeRuntimeRef.current === runtime) activeRuntimeRef.current = null;
      if (readyRuntimeRef.current === runtime) readyRuntimeRef.current = null;
      void runtime.dispose();
    };
  }, [createRuntime, queryClient, runtime]);

  return (
    <BackendProvider backend={runtime.backend}>
      <DataApiProvider dataApi={runtime.dataApi}>
        <SkillQueryBridge />
        <ProviderRegistryQueryBridge />
        <PreferenceProvider preference={runtime.preference}>
          <AppBootstrapContext value={state}>
            <AppBootstrapPostReadyContext value={startPostReady}>
              {children}
            </AppBootstrapPostReadyContext>
          </AppBootstrapContext>
        </PreferenceProvider>
      </DataApiProvider>
    </BackendProvider>
  );
}

/** Triggers deferred PostReady initialization once startup content has dismissed the splash cover. */
export function AppBootstrapPostReady({ ready }: { ready: boolean }) {
  const state = useAppBootstrapState();
  const startPostReady = use(AppBootstrapPostReadyContext);

  useEffect(() => {
    if (!ready || state.status !== 'ready' || !startPostReady) {
      return;
    }

    const frame = requestAnimationFrame(() => startPostReady());
    return () => cancelAnimationFrame(frame);
  }, [ready, startPostReady, state.status]);

  return null;
}

// 模块级函数：try/finally 会让 React Compiler 对组件 bail out，故初始化流程放在组件体外。
async function initializeApp({
  isDisposed,
  onReady,
  queryClient,
  retry,
  runtime,
  setState,
}: {
  isDisposed: () => boolean;
  onReady: () => void;
  queryClient: QueryClient;
  retry: () => void;
  runtime: AppBootstrapRuntime;
  setState: (state: AppBootstrapState) => void;
}) {
  const finish = startStartupStage('startup.bootstrap');
  try {
    recordSentryBreadcrumb('startup.bootstrap');
    await runtime.initialize();
    finish(isDisposed() ? 'cancelled' : 'completed');

    if (!isDisposed()) {
      prefetchLastChatAgent(queryClient, runtime.dataApi);
      recordSentryBreadcrumb('startup.ready');
      setState({ status: 'ready' });
      onReady();
    }
  } catch (error) {
    finish('failed');
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
