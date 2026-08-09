import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { Text } from 'react-native';

import {
  getEndpointLabel,
  resolveVisibleEndpointTypes,
} from '../ProviderScreen/apiService/utils/providerApiServiceEndpointRules';

type ProviderEndpoint = {
  accessibilityLabel: string;
  shortLabel: string;
  type: EndpointType;
};

const endpointShortLabels: Record<EndpointType, string> = {
  'anthropic-messages': 'Messages',
  'google-generate-content': 'Generate Content',
  'jina-rerank': 'Rerank',
  'ollama-chat': 'Ollama Chat',
  'ollama-generate': 'Ollama Generate',
  'openai-audio-transcription': 'Transcription',
  'openai-audio-translation': 'Translation',
  'openai-chat-completions': 'Chat Completions',
  'openai-embeddings': 'Embeddings',
  'openai-image-edit': 'Image Edit',
  'openai-image-generation': 'Image Generation',
  'openai-responses': 'Responses',
  'openai-text-completions': 'Text Completions',
  'openai-text-to-speech': 'Text to Speech',
  'openai-video-generation': 'Video Generation',
};

export function getProviderEndpoints(
  provider: Pick<Provider, 'defaultChatEndpoint' | 'endpointConfigs'>,
): ProviderEndpoint[] {
  return resolveVisibleEndpointTypes(provider).map((type) => ({
    accessibilityLabel: getEndpointLabel(type),
    shortLabel: endpointShortLabels[type],
    type,
  }));
}

export function ProviderEndpointSummary({ endpoints }: { endpoints: readonly ProviderEndpoint[] }) {
  return (
    <Text className="text-foreground-tertiary text-xs">
      {endpoints.map(({ shortLabel }) => shortLabel).join(' · ')}
    </Text>
  );
}
