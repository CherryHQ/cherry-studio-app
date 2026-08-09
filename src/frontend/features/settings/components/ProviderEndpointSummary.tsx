import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon } from '@/frontend/components/BrandAvatar';

import {
  getEndpointLabel,
  resolveVisibleEndpointTypes,
} from '../ProviderScreen/apiService/utils/providerApiServiceEndpointRules';

type ProviderEndpoint = {
  iconId: string;
  label: string;
  type: EndpointType;
};

const endpointIconIds: Record<EndpointType, string> = {
  'anthropic-messages': 'anthropic',
  'google-generate-content': 'gemini',
  'jina-rerank': 'jina',
  'ollama-chat': 'ollama',
  'ollama-generate': 'ollama',
  'openai-audio-transcription': 'openai',
  'openai-audio-translation': 'openai',
  'openai-chat-completions': 'openai',
  'openai-embeddings': 'openai',
  'openai-image-edit': 'openai',
  'openai-image-generation': 'openai',
  'openai-responses': 'openai',
  'openai-text-completions': 'openai',
  'openai-text-to-speech': 'openai',
  'openai-video-generation': 'openai',
};

export function getProviderEndpoints(
  provider: Pick<Provider, 'defaultChatEndpoint' | 'endpointConfigs'>,
): ProviderEndpoint[] {
  return resolveVisibleEndpointTypes(provider).map((type) => ({
    iconId: endpointIconIds[type],
    label: getEndpointLabel(type),
    type,
  }));
}

export function ProviderEndpointSummary({ endpoints }: { endpoints: readonly ProviderEndpoint[] }) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
      {endpoints.map((endpoint) => {
        const iconSource = resolveProviderIcon(endpoint.iconId);

        return (
          <View className="flex-row items-center gap-1.5" key={endpoint.type}>
            {iconSource ? (
              <BrandAvatar label={endpoint.label} size={18}>
                <BrandAvatarIcon
                  iconId={endpoint.iconId}
                  recyclingKey={endpoint.type}
                  source={iconSource[iconTheme]}
                />
              </BrandAvatar>
            ) : null}
            <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
              {endpoint.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
