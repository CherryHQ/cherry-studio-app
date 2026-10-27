import { useQuery } from '@tanstack/react-query';

import { useBackendModule, usePreference } from '@/frontend/data';

/** Keep the enabled entry actionable when the device needs setup, so it can offer guidance. */
export function useDictationAvailability(): boolean {
  const voice = useBackendModule('voice');
  const [engine] = usePreference('feature.voice.dictation_engine');
  const systemStatus = useQuery({
    queryKey: ['voice', 'engine-status', 'dictation', 'system'],
    enabled: engine === 'system',
    queryFn: ({ signal }) => voice.getEngineStatus('dictation', 'system', { signal }),
    staleTime: 0,
    retry: false,
  });
  return (
    engine === 'system' &&
    (systemStatus.data === 'ready' || systemStatus.data === 'needs-setup') &&
    !systemStatus.isError
  );
}
