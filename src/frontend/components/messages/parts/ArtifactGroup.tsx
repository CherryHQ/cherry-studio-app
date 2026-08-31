import SparklesIcon from '@cherrystudio/app-icons/icons/sparkles';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { FilePart } from './FilePart';

type ArtifactFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/** Keeps assistant-created files visually separate from ordinary message content. */
export function ArtifactGroup({ parts }: { parts: readonly ArtifactFilePart[] }) {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t('chat.artifacts.title')}
      className="gap-3 rounded-2xl bg-grouped-surface p-3"
      testID="message-artifact-group"
    >
      <View className="flex-row items-center gap-2">
        <SparklesIcon className="size-4 text-foreground" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-foreground">{t('chat.artifacts.title')}</Text>
          <Text className="text-xs text-muted-foreground">{t('chat.artifacts.description')}</Text>
        </View>
      </View>
      <ScrollView
        alwaysBounceHorizontal={false}
        contentContainerClassName="gap-3"
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {parts.map((part) => (
          <View className="w-28 gap-1.5" key={`${part.url}:${part.filename}`}>
            <FilePart part={part} size={112} />
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {part.filename}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
