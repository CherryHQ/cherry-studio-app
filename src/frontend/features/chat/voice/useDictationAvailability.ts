import { useQuery } from '@tanstack/react-query';

import { useBackendModule, usePreference } from '@/frontend/data';
import { VOICE_ENGINES } from '@/shared/contracts/voice';

/** Keep the enabled entry actionable when the device needs setup, so it can offer guidance. */
export function useDictationAvailability(): boolean {
  const voice = useBackendModule('voice');
  const [engine] = usePreference('feature.voice.dictation_engine');
  const selected = VOICE_ENGINES.find((entry) => entry === engine);
  const status = useQuery({
    queryKey: ['voice', 'engine-status', 'dictation', selected],
    enabled: !!selected,
    queryFn: ({ signal }) => voice.getEngineStatus('dictation', selected!, { signal }),
    staleTime: 0,
    retry: false,
  });
  return (
    !!selected &&
    (status.data === 'ready' || status.data === 'needs-setup' || status.data === 'needs-model') &&
    !status.isError
  );
}
