import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import { View } from 'react-native';

import type { MessagePartTranslationProps } from '../message-part.types';

export function MessagePartTranslation({ children }: MessagePartTranslationProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <LanguagesIcon className="size-4 text-foreground-tertiary" />
        <View className="h-px flex-1 bg-border" />
      </View>
      {children}
    </View>
  );
}
