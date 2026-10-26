import { useQuery } from '@tanstack/react-query';

import { useBackendModule, usePreference } from '@/frontend/data';

/** Show voice input only when enabled and the device's system recognizer is available. */
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
  return engine === 'system' && systemStatus.data === 'ready' && !systemStatus.isError;
}
