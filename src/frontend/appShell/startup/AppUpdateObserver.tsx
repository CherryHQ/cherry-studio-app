import { useQuery } from '@tanstack/react-query';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';

/** Check once the app is ready, without blocking startup or presenting a dialog. */
export function AppUpdateObserver() {
  const appUpdate = useBackendModule('appUpdate');
  useQuery(appUpdateQueryOptions(appUpdate));
  return null;
}
