import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { ModelPickerIcon, useModelPickerData } from '@/components/modelPicker';
import type { Assistant } from '@/data/types/assistant';
import { useAssistantApiById } from '@/hooks/chat';

export default function AssistantDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assistantId } = useLocalSearchParams<{ assistantId: string }>();
  const { assistant, error, isLoading } = useAssistantApiById(assistantId);

  const openEditAssistant = useCallback(() => {
    router.push({
      params: { assistantId },
      pathname: '/assistants/[assistantId]/edit',
    });
  }, [assistantId, router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.edit'),
        key: 'edit-assistant',
        label: t('common.edit'),
        onPress: openEditAssistant,
      },
    ],
    [openEditAssistant, t],
  );

  if (!assistantId || error) {
    return <Redirect href="/assistants" />;
  }

  return (
    <>
      <BackHeader rightActions={rightActions} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {assistant ? (
          <AssistantSummary assistant={assistant} />
        ) : (
          <Text className="text-center text-default-foreground text-sm">
            {isLoading ? t('assistant.form.loading') : t('assistant.list.emptyTitle')}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

function AssistantSummary({ assistant }: { assistant: Assistant }) {
  return (
    <View className="items-center gap-4">
      <View className="size-24 items-center justify-center">
        {/* Apple Color Emoji draws taller than its point size, so a line height
            equal to the font size (Tailwind's `text-6xl` default) clips the top
            of the glyph — give it the same ~1.3 slack the list rows use. */}
        <Text className="text-6xl leading-20">{assistant.emoji}</Text>
      </View>
      <View className="items-center gap-1.5">
        <Text className="text-center font-semibold text-2xl text-foreground" numberOfLines={2}>
          {assistant.name}
        </Text>
        <AssistantModelLine modelId={assistant.modelId} modelName={assistant.modelName} />
      </View>
    </View>
  );
}

function AssistantModelLine({ modelId, modelName }: Pick<Assistant, 'modelId' | 'modelName'>) {
  const { t } = useTranslation();
  const { getModelItem } = useModelPickerData();
  // Null when the assistant has no model, or when its model is no longer served
  // by any provider — the stored `modelName` still names it, so fall back to that
  // rather than claiming nothing is selected.
  const model = getModelItem(modelId);

  if (!model) {
    return (
      <Text className="text-center text-base text-default-foreground" numberOfLines={1}>
        {modelName ?? t('assistant.model.none')}
      </Text>
    );
  }

  return (
    <View className="max-w-full flex-row items-center gap-1.5">
      <ModelPickerIcon item={model} size={20} />
      <Text className="min-w-0 shrink text-base text-default-foreground" numberOfLines={1}>
        {model.model.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
});
