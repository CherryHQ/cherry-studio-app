import { createContext, type PropsWithChildren, use } from 'react';

type StartupReadinessProviderProps = PropsWithChildren<{
  reportContentReady: () => void;
}>;

const StartupReadinessContext = createContext<(() => void) | null>(null);
const StartupCoverVisibleContext = createContext(false);

export function StartupReadinessProvider({
  children,
  reportContentReady,
}: StartupReadinessProviderProps) {
  return <StartupReadinessContext value={reportContentReady}>{children}</StartupReadinessContext>;
}

export function StartupCoverVisibleProvider({
  children,
  visible,
}: PropsWithChildren<{ visible: boolean }>) {
  return <StartupCoverVisibleContext value={visible}>{children}</StartupCoverVisibleContext>;
}

/** Whether the startup cover still hides the application. False outside `StartupCoordinator`. */
export function useStartupCoverVisible() {
  return use(StartupCoverVisibleContext);
}

export function useReportStartupContentReady() {
  const reportContentReady = use(StartupReadinessContext);

  if (!reportContentReady) {
    throw new Error('useReportStartupContentReady must be used within StartupCoordinator');
  }

  return reportContentReady;
}
