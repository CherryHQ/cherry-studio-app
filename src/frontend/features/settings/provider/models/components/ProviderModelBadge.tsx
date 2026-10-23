import { Text, View } from 'react-native';

import { ModelPickerBadge } from '@/frontend/components/ModelPicker';

import type { ProviderModelBadge as ProviderModelBadgeValue } from '../utils/providerModelBadges';

/** A compact, inert visual mark; the containing row owns its spoken label. */
export function ProviderModelBadge({ badge }: { badge: ProviderModelBadgeValue }) {
  if (badge === 'speech' || badge === 'transcription') {
    return (
      <View
        accessibilityElementsHidden
        className="h-5 items-center justify-center rounded-lg bg-tag-blue px-1.5"
        importantForAccessibility="no-hide-descendants"
        testID={`provider-model-badge-${badge}`}
      >
        <Text className="text-xs font-medium text-tag-blue-foreground">
          {badge === 'speech' ? 'TTS' : 'STT'}
        </Text>
      </View>
    );
  }
  return <ModelPickerBadge badge={badge} testIDPrefix="provider-model-badge" />;
}
