import { useQuery } from '@tanstack/react-query';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';

import { useAppUpdateActions } from './AppUpdateProvider';

/** State for a page's ordinary "check for updates" row; the update dialog owns everything else. */
export function useAppUpdateEntry() {
  const appUpdate = useBackendModule('appUpdate');
  const { data, isFetching } = useQuery({ ...appUpdateQueryOptions(appUpdate), enabled: false });
  const actions = useAppUpdateActions();

  return {
    checkForUpdates: actions.check,
    // A known newer version stays visible when a later background refresh fails.
    hasAvailableUpdate: data?.status === 'available',
    isEnabled: appUpdate.isEnabled,
    isFetching,
  };
}
