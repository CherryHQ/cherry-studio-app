import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { BotIcon, ChevronRightIcon, GlobeIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useConfirmDialog } from '@/components/confirmDialog';
import { type HeaderToolbarAction, TabRootHeader } from '@/components/headers';

import type { Assistant } from '@/data/types/assistant';
import { useAssistantMutations, useAssistantsApi } from '@/hooks/chat';

// Width of the revealed swipe-to-delete panel; keep in sync with `w-20` below.
const deleteActionWidth = 80;

export default function AssistantListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { assistants, isLoading } = useAssistantsApi();
  const { deleteAssistant } = useAssistantMutations();
  const { confirmDialog, requestConfirm } = useConfirmDialog();

  const openCreateAssistant = useCallback(() => {
    router.push('/assistants/edit');
  }, [router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('assistant.actions.create'),
        androidIcon: PlusIcon,
        icon: 'plus',
        key: 'create-assistant',
        onPress: openCreateAssistant,
      },
    ],
    [openCreateAssistant, t],
  );
  const openEditAssistant = useCallback(
    (assistantId: string) => {
      router.push({
        pathname: '/assistants/edit',
        params: { assistantId },
      });
    },
    [router],
  );
  const requestDeleteAssistant = useCallback(
    (assistant: Assistant) => {
      requestConfirm({
        title: t('assistant.delete.title'),
        message: t('assistant.delete.message', { name: assistant.name }),
        onConfirm: () => {
          void deleteAssistant(assistant.id).catch(() => {
            toast.show({
              label: t('assistant.toast.deleteFailed'),
              variant: 'danger',
            });
          });
        },
      });
    },
    [deleteAssistant, requestConfirm, t, toast],
  );

  return (
    <>
      <TabRootHeader rightActions={rightActions} title={t('assistant.list.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-2"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {assistants.length > 0 ? (
          <View className="gap-3">
            {assistants.map((assistant) => (
              <AssistantListRow
                key={assistant.id}
                assistant={assistant}
                onDelete={requestDeleteAssistant}
                onEdit={openEditAssistant}
              />
            ))}
          </View>
        ) : (
          <AssistantEmptyState isLoading={isLoading} onCreate={openCreateAssistant} />
        )}
      </ScrollView>
      {confirmDialog}
    </>
  );
}

type AssistantListRowProps = {
  assistant: Assistant;
  onDelete: (assistant: Assistant) => void;
  onEdit: (assistantId: string) => void;
};

function AssistantListRow({ assistant, onDelete, onEdit }: AssistantListRowProps) {
  const { t } = useTranslation();
  const descriptionText = assistant.description || assistant.prompt;
  const swipeableRef = useRef<SwipeableMethods>(null);

  const handleDeletePress = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(assistant);
  }, [assistant, onDelete]);
  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <DeleteAction drag={drag} label={t('common.remove')} onPress={handleDeletePress} />
    ),
    [handleDeletePress, t],
  );

  return (
    <ReanimatedSwipeable
      containerStyle={styles.swipeable}
      friction={2}
      overshootRight={false}
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
    >
      <Pressable
        accessibilityLabel={assistant.name}
        accessibilityRole="button"
        className="flex-row items-center gap-3 bg-settings-grouped-surface px-4 py-3 active:opacity-70"
        onPress={() => onEdit(assistant.id)}
      >
        <View className="size-9 items-center justify-center rounded-full bg-surface-secondary">
          <Text className="text-xl leading-6">{assistant.emoji || '🌟'}</Text>
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
            {assistant.name}
          </Text>
          {descriptionText ? (
            <Text className="text-default-foreground text-sm" numberOfLines={1}>
              {descriptionText}
            </Text>
          ) : null}
          {assistant.settings.enableWebSearch ? (
            <View className="flex-row flex-wrap gap-1.5 pt-1">
              <AssistantBadge icon="web" label={t('assistant.list.webBadge')} />
            </View>
          ) : null}
        </View>
        <ChevronRightIcon className="size-5 text-default-foreground" strokeWidth={2.25} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

type DeleteActionProps = {
  drag: SharedValue<number>;
  label: string;
  onPress: () => void;
};

function DeleteAction({ drag, label, onPress }: DeleteActionProps) {
  // Follow the drag so the button slides in with the finger: at rest `drag` is 0
  // and the panel is pushed one width off-screen; fully open `drag` is
  // `-deleteActionWidth`, landing it flush against the row (per the RNGH docs).
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + deleteActionWidth }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="h-full w-20 items-center justify-center gap-1 bg-danger active:opacity-80"
        onPress={onPress}
      >
        <Trash2Icon className="size-6 text-danger-foreground" strokeWidth={2} />
        <Text className="font-medium text-danger-foreground text-xs">{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function AssistantBadge({ icon, label }: { icon?: 'web'; label: string }) {
  return (
    <View className="min-h-6 max-w-full flex-row items-center gap-1 rounded-full bg-surface-secondary px-2">
      {icon === 'web' ? (
        <GlobeIcon className="size-3.5 text-default-foreground" strokeWidth={2.25} />
      ) : null}
      <Text className="font-semibold text-default-foreground text-xs" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function AssistantEmptyState({
  isLoading,
  onCreate,
}: {
  isLoading: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="items-center justify-center gap-4 px-8 py-16">
      <View className="size-14 items-center justify-center rounded-full bg-settings-grouped-surface">
        <BotIcon className="size-7 text-default-foreground" strokeWidth={2} />
      </View>
      <View className="items-center gap-1">
        <Text className="text-center font-semibold text-foreground text-lg">
          {isLoading ? t('assistant.list.loading') : t('assistant.list.emptyTitle')}
        </Text>
        {!isLoading ? (
          <Text className="text-center text-default-foreground text-sm">
            {t('assistant.list.emptyDescription')}
          </Text>
        ) : null}
      </View>
      {!isLoading ? (
        <Pressable
          accessibilityLabel={t('assistant.actions.create')}
          accessibilityRole="button"
          className="rounded-full bg-foreground px-5 py-2 active:opacity-80"
          onPress={onCreate}
        >
          <Text className="font-semibold text-background text-base">
            {t('assistant.actions.create')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Clip the revealed delete action to the row's rounded card so its right
  // corners match the surface instead of spilling past it.
  swipeable: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});
