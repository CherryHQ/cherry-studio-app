import { Button } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { ModelPickerIcon, useModelPickerData } from '@/frontend/components/modelPicker';
import { useAssistantApiById } from '@/frontend/hooks/chat';
import { screenBottomActionInset } from '@/frontend/utils/constants';
import type { Assistant } from '@/shared/data/types/assistant';

export default function AssistantDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assistantId, returnTopicId } = useLocalSearchParams<{
    assistantId: string;
    returnTopicId?: string;
  }>();
  const { assistant, error, isLoading } = useAssistantApiById(assistantId);

  const returnToTopic = useCallback(() => {
    if (!returnTopicId) {
      return;
    }

    router.dismissTo({
      params: { topicId: returnTopicId },
      pathname: '/',
    });
  }, [returnTopicId, router]);
  const openEditAssistant = useCallback(() => {
    router.push({
      params: { assistantId },
      pathname: '/assistants/[assistantId]/edit',
    });
  }, [assistantId, router]);
  // Lands on the new-topic screen with the assistant carried along, so the
  // first message creates a topic already bound to it.
  const startChat = useCallback(() => {
    router.push({ params: { assistantId }, pathname: '/' });
  }, [assistantId, router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.edit'),
        key: 'edit-assistant',
        label: t('common.edit'),
        onPress: openEditAssistant,
        type: 'label',
      },
    ],
    [openEditAssistant, t],
  );

  if (!assistantId || error) {
    return <Redirect href="/assistants" />;
  }

  return (
    <>
      <RouteHeader onBack={returnTopicId ? returnToTopic : undefined} rightActions={rightActions} />
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
          <Text className="text-center text-foreground text-sm">
            {isLoading ? t('assistant.form.loading') : t('assistant.list.emptyTitle')}
          </Text>
        )}
      </ScrollView>
      {assistant ? (
        // The home indicator is this button's only neighbour, so the button
        // has to keep clear of it itself.
        <View
          className="px-4 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, screenBottomActionInset) }}
        >
          <Button
            accessibilityLabel={t('assistant.actions.startChat')}
            className="rounded-2xl"
            onPress={startChat}
          >
            {t('assistant.actions.startChat')}
          </Button>
        </View>
      ) : null}
    </>
  );
}

function AssistantSummary({ assistant }: { assistant: Assistant }) {
  const { t } = useTranslation();
  const prompt = assistant.prompt.trim();

  return (
    <View className="items-center gap-6">
      <View className="items-center gap-4">
        <View className="min-h-24 min-w-24 items-center justify-center">
          <Text className="text-emoji-6xl">{assistant.emoji}</Text>
        </View>
        <View className="items-center gap-1.5">
          <Text className="text-center font-semibold text-2xl text-foreground" numberOfLines={2}>
            {assistant.name}
          </Text>
          <AssistantModelLine modelId={assistant.modelId} modelName={assistant.modelName} />
        </View>
      </View>
      {prompt ? (
        <View className="w-full gap-2 rounded-2xl bg-grouped-surface p-4">
          <Text className="font-medium text-foreground text-sm">{t('assistant.form.prompt')}</Text>
          <Text className="text-base text-foreground" selectable>
            {prompt}
          </Text>
        </View>
      ) : null}
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
      <Text className="text-center text-base text-foreground" numberOfLines={1}>
        {modelName ?? t('assistant.model.none')}
      </Text>
    );
  }

  return (
    <View className="max-w-full flex-row items-center gap-1.5">
      <ModelPickerIcon model={model.model} provider={model.provider} size={20} />
      <Text className="min-w-0 shrink text-base text-foreground" numberOfLines={1}>
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
