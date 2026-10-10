import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useBackendModule } from './BackendProvider';
import { useApiClient } from './DataApiProvider';
import { isSkillQuery } from './queryKeys/skills';

/** Keep installation and environment projections current across mounted screens. */
export function SkillQueryBridge() {
  const skills = useBackendModule('skills');
  const dataApi = useApiClient();
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ predicate: ({ queryKey }) => isSkillQuery(queryKey) });
    };
    const unsubscribe = skills.subscribeChanges(refresh);
    const unsubscribeData = dataApi.subscribeChanges?.((paths) => {
      if (
        paths.some((path) =>
          /^\/(skills|agents|models|providers|plugins|mcp-servers)(\/|$)/.test(path),
        )
      )
        refresh();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsubscribe();
      unsubscribeData?.();
      subscription.remove();
    };
  }, [dataApi, queryClient, skills]);
  return null;
}
