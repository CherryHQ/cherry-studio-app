import * as SplashScreen from 'expo-splash-screen';
import { createContext, type PropsWithChildren, use, useEffect, useMemo, useState } from 'react';

import { runPostReadyTasks } from '@/data/bootstrap/appRuntime';
import { DbService } from '@/data/db/DbService';
import { createDataServices, type DataServices } from '@/data/services/createDataServices';

/** The long-lived resources owned by `DataProvider`. Injectable so tests can
 * drive the startup sequence without opening a real SQLite database. */
export type DataRuntime = {
  dbService: Pick<DbService, 'init' | 'dispose'>;
  services: DataServices;
};

function createDefaultRuntime(): DataRuntime {
  const dbService = new DbService();
  return { dbService, services: createDataServices(dbService) };
}

type DataProviderProps = PropsWithChildren<{
  bootstrap: (services: DataServices) => Promise<void> | void;
  /** Test seam. Defaults to a real `DbService` + full service graph. */
  createRuntime?: () => DataRuntime;
}>;

type DataState =
  | {
      error?: never;
      services?: never;
      status: 'loading';
    }
  | {
      error?: never;
      services: DataServices;
      status: 'ready';
    }
  | {
      error: Error;
      services?: never;
      status: 'error';
    };

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ bootstrap, children, createRuntime }: DataProviderProps) {
  const { dbService, services } = useMemo(
    () => (createRuntime ?? createDefaultRuntime)(),
    [createRuntime],
  );
  const [state, setState] = useState<DataState>({ status: 'loading' });

  useEffect(() => {
    let disposed = false;

    void initData({
      bootstrap,
      dbService,
      isDisposed: () => disposed,
      services,
      setState,
    });

    return () => {
      disposed = true;
      services.mcp.dispose();
      services.webSearch.dispose();
      dbService.dispose();
    };
  }, [bootstrap, dbService, services]);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

// 模块级函数：try/finally 会让 React Compiler 对组件 bail out，故初始化流程放在组件体外。
async function initData({
  bootstrap,
  dbService,
  isDisposed,
  services,
  setState,
}: {
  bootstrap: DataProviderProps['bootstrap'];
  dbService: DataRuntime['dbService'];
  isDisposed: () => boolean;
  services: DataServices;
  setState: (state: DataState) => void;
}) {
  try {
    await dbService.init();
    await services.preference.init();

    if (isDisposed()) {
      return;
    }

    await bootstrap(services);

    if (!isDisposed()) {
      setState({ services, status: 'ready' });
      // Off the startup critical path: fire once the gate opens.
      void runPostReadyTasks(services);
    }
  } catch (error) {
    if (!isDisposed()) {
      setState({ error: toError(error), status: 'error' });
    }
  } finally {
    // The native splash is held up by `preventAutoHideAsync` in the root
    // layout; reveal the app once init settles either way. Imperative (not
    // an effect) because the error path throws during `InitialDataGate`
    // render and would never run a commit-phase effect.
    void SplashScreen.hideAsync().catch(() => {});
  }
}

export function useDataState() {
  const state = use(DataContext);

  if (!state) {
    throw new Error('useDataState must be used within DataProvider');
  }

  return state;
}

export function useDataServices() {
  const state = useDataState();

  if (state.status !== 'ready') {
    throw new Error('Data services are not ready');
  }

  return state.services;
}

function toError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
