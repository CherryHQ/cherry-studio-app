import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useBackendModule, usePreference } from '@/frontend/data';
import type { VoiceModelSelection, VoiceOperation } from '@/shared/contracts/voice';

export function useVoiceModel(operation: VoiceOperation) {
  const voice = useBackendModule('voice');
  const [saved, save] = usePreference(
    operation === 'speech' ? 'feature.voice.speech_model' : 'feature.voice.transcription_model',
  );
  const [selection, setSelection] = useState<VoiceModelSelection>(
    () => saved ?? { providerId: '', modelId: operation === 'speech' ? 'tts-1' : 'whisper-1' },
  );
  const providers = useQuery({
    queryKey: ['voice', 'providers'],
    queryFn: ({ signal }) => voice.listProviders({ signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const isValid =
    Boolean(selection.modelId.trim()) &&
    Boolean(providers.data?.some((provider) => provider.id === selection.providerId));
  return {
    providers,
    selection,
    setSelection,
    isValid,
    save: () => save({ ...selection, modelId: selection.modelId.trim() }),
  };
}
