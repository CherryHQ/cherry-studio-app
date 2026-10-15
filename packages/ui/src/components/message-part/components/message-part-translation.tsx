import { View } from 'react-native';

import type { MessagePartTranslationProps } from '../message-part.types';

export function MessagePartTranslation({ children }: MessagePartTranslationProps) {
  return (
    <View className="gap-2">
      <View className="h-px bg-border" />
      {children}
    </View>
  );
}
