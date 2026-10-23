import { useQuery as useDeviceQuery } from '@tanstack/react-query';

import { useBackendModule, usePreference, useQuery } from '@/frontend/data';
import { useProviders } from '@/frontend/hooks/chat/useProvider';
import { isSpeechToTextModel } from '@/shared/utils/modelPurpose';

/** Show voice input only after setup and while its selected engine/model remains usable. */
export function useDictationAvailability(): boolean {
  const voice = useBackendModule('voice');
  const [engine] = usePreference('feature.voice.dictation_engine');
  const [selection] = usePreference('feature.voice.transcription_model');
  const systemStatus = useDeviceQuery({
    queryKey: ['voice', 'engine-status', 'dictation', 'system'],
    enabled: engine === 'system',
    queryFn: ({ signal }) => voice.getEngineStatus('dictation', 'system', { signal }),
    staleTime: 0,
    retry: false,
  });
  const { providers } = useProviders({ enabled: true });
  const models = useQuery('/models', {
    enabled: engine === 'ai' && Boolean(selection),
    query: { providerId: selection?.providerId, enabled: true, isSystemSupported: true },
  });

  if (engine === 'system') return systemStatus.data === 'ready' && !systemStatus.isError;
  if (engine !== 'ai' || !selection || models.isError) return false;
  return (
    providers.some((provider) => provider.id === selection.providerId) &&
    (models.data?.some(
      (model) =>
        model.providerId === selection.providerId &&
        model.modelId === selection.modelId &&
        model.isEnabled &&
        !model.isHidden &&
        isSpeechToTextModel(model),
    ) ??
      false)
  );
}
