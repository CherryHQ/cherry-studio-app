import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { ModelPickerIcon, useModelPickerData } from '@/components/modelPicker';
import { useSetBottomTabBarHidden } from '@/components/navigation';
import type { Assistant } from '@/data/types/assistant';
import { useAssistantApiById } from '@/hooks/chat';
import { screenBottomActionInset } from '@/utils/constants';

export default function AssistantDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setBottomTabBarHidden = useSetBottomTabBarHidden();
  const { assistantId, returnTopicId } = useLocalSearchParams<{
    assistantId: string;
    returnTopicId?: string;
  }>();
  const { assistant, error, isLoading } = useAssistantApiById(assistantId);

  useEffect(() => {
    setBottomTabBarHidden(true);
    return () => setBottomTabBarHidden(false);
  }, [setBottomTabBarHidden]);

  const returnToTopic = useCallback(() => {
    if (!returnTopicId) {
      return;
    }

    router.dismissTo({
      params: { topicId: returnTopicId },
      pathname: '/topics',
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
    router.push({ params: { assistantId }, pathname: '/topics' });
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
      <BackHeader onBack={returnTopicId ? returnToTopic : undefined} rightActions={rightActions} />
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
      {assistant ? (
        // The screen sits above the tab bar, so the home indicator is this
        // button's only neighbour and it has to keep clear of it itself.
        <View
          className="px-4 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, screenBottomActionInset) }}
        >
          <Button
            accessibilityLabel={t('assistant.actions.startChat')}
            className="rounded-2xl"
            variant="primary"
            onPress={startChat}
          >
            <Text className="font-medium text-base text-white">
              {t('assistant.actions.startChat')}
            </Text>
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
      {prompt ? (
        <View className="w-full gap-2 rounded-2xl bg-settings-grouped-surface p-4">
          <Text className="font-medium text-default-foreground text-sm">
            {t('assistant.form.prompt')}
          </Text>
          <Text className="text-base text-foreground leading-6" selectable>
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
      <Text className="text-center text-base text-default-foreground" numberOfLines={1}>
        {modelName ?? t('assistant.model.none')}
      </Text>
    );
  }

  return (
    <View className="max-w-full flex-row items-center gap-1.5">
      <ModelPickerIcon model={model.model} provider={model.provider} size={20} />
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
