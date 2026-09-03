import { createContext, type PropsWithChildren, use } from 'react';

type StartupReadinessProviderProps = PropsWithChildren<{
  reportContentReady: () => void;
}>;

const StartupReadinessContext = createContext<(() => void) | null>(null);

export function StartupReadinessProvider({
  children,
  reportContentReady,
}: StartupReadinessProviderProps) {
  return <StartupReadinessContext value={reportContentReady}>{children}</StartupReadinessContext>;
}

export function useReportStartupContentReady() {
  const reportContentReady = use(StartupReadinessContext);

  if (!reportContentReady) {
    throw new Error('useReportStartupContentReady must be used within StartupCoordinator');
  }

  return reportContentReady;
}
