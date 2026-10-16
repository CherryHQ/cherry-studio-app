import { useQuery } from '@tanstack/react-query';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { isAvatarSource } from '@/shared/data/types/avatar';

export function useAvatarResource(source: string | null | undefined) {
  const avatars = useBackendModule('avatars');
  return useQuery({
    queryKey: queryKeys.avatars.resource(source ?? ''),
    queryFn: () => avatars.resolve(source!),
    enabled: isAvatarSource(source),
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });
}
