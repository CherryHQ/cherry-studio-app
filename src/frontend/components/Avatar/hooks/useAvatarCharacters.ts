import { useQuery } from '@tanstack/react-query';

import { queryKeys, useBackendModule } from '@/frontend/data';

/** The on-device character library; refetched by whoever changes it. */
export function useAvatarCharacters() {
  const avatars = useBackendModule('avatars');
  return useQuery({
    queryKey: queryKeys.avatars.characters(),
    queryFn: () => avatars.listCharacters(),
    networkMode: 'always',
    staleTime: Infinity,
  });
}
