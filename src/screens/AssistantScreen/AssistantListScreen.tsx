import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { BotIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useConfirmDialog } from '@/components/confirmDialog';
import { type HeaderToolbarAction, TabRootHeader } from '@/components/headers';

import type { Assistant } from '@/data/types/assistant';
import { useAssistantMutations, useAssistantsApi } from '@/hooks/chat';
import { useExclusiveSwipeable } from '@/hooks/useExclusiveSwipeable';

// Width of the revealed swipe-to-delete panel; keep in sync with `w-16` below.
const DELETE_ACTION_WIDTH = 64;
const ASSISTANT_ROW_MAX_TAP_DISTANCE = 8;
const ASSISTANT_ROW_ACCESSIBILITY_ACTIONS = [{ name: 'activate' as const }];

export default function AssistantListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { assistants, isLoading } = useAssistantsApi();
  const { deleteAssistant } = useAssistantMutations();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const { notifyClose, notifyWillOpen } = useExclusiveSwipeable();

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
        contentContainerClassName="px-2"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {assistants.length > 0 ? (
          <View>
            {assistants.map((assistant, index) => (
              <AssistantListRow
                key={assistant.id}
                assistant={assistant}
                isLast={index === assistants.length - 1}
                notifyClose={notifyClose}
                notifyWillOpen={notifyWillOpen}
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
  isLast: boolean;
  notifyClose: (swipeable: SwipeableMethods) => void;
  notifyWillOpen: (swipeable: SwipeableMethods) => void;
  onDelete: (assistant: Assistant) => void;
  onEdit: (assistantId: string) => void;
};

function AssistantListRow({
  assistant,
  isLast,
  notifyClose,
  notifyWillOpen,
  onDelete,
  onEdit,
}: AssistantListRowProps) {
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const isSwipeOpen = useSharedValue(0);
  const pressProgress = useSharedValue(0);

  const handleDeletePress = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(assistant);
  }, [assistant, onDelete]);
  const handleEditPress = useCallback(() => {
    onEdit(assistant.id);
  }, [assistant.id, onEdit]);
  const handleSwipeableWillOpen = useCallback(() => {
    isSwipeOpen.value = 1;
  }, [isSwipeOpen]);
  const handleSwipeableClose = useCallback(() => {
    isSwipeOpen.value = 0;
    if (swipeableRef.current) {
      notifyClose(swipeableRef.current);
    }
  }, [isSwipeOpen, notifyClose]);
  // Fires the instant a drag starts opening this row (before release), so the
  // previously open row starts closing immediately instead of waiting for
  // this swipe to finish settling.
  const handleSwipeableOpenStartDrag = useCallback(() => {
    if (swipeableRef.current) {
      notifyWillOpen(swipeableRef.current);
    }
  }, [notifyWillOpen]);
  const editTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(ASSISTANT_ROW_MAX_TAP_DISTANCE)
        .onBegin(() => {
          pressProgress.value = 1;
        })
        .onFinalize(() => {
          pressProgress.value = 0;
        })
        .onEnd((_event, success) => {
          if (success && isSwipeOpen.value === 0) {
            runOnJS(handleEditPress)();
          }
        }),
    [handleEditPress, isSwipeOpen, pressProgress],
  );
  const pressedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: pressProgress.value,
  }));
  const borderStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressProgress.value,
  }));
  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <DeleteAction drag={drag} label={t('common.remove')} onPress={handleDeletePress} />
    ),
    [handleDeletePress, t],
  );

  return (
    <ReanimatedSwipeable
      friction={2}
      onSwipeableClose={handleSwipeableClose}
      onSwipeableOpenStartDrag={handleSwipeableOpenStartDrag}
      onSwipeableWillOpen={handleSwipeableWillOpen}
      overshootRight={false}
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      simultaneousWithExternalGesture={editTapGesture}
    >
      <GestureDetector gesture={editTapGesture}>
        <View
          accessibilityActions={ASSISTANT_ROW_ACCESSIBILITY_ACTIONS}
          accessibilityLabel={assistant.name}
          accessibilityRole="button"
          accessible
          onAccessibilityAction={handleEditPress}
        >
          <View className="relative min-w-0 flex-1 flex-row items-center gap-2 py-2 pl-2">
            <Animated.View
              className="absolute inset-0 bg-settings-grouped-surface"
              pointerEvents="none"
              style={pressedBackgroundStyle}
            />
            <Animated.View
              className={
                isLast
                  ? 'absolute inset-y-0 right-0 left-14 border-border border-y'
                  : 'absolute top-0 right-0 left-14 border-border border-t'
              }
              pointerEvents="none"
              style={borderStyle}
            />
            <Text className="size-10 text-center text-4xl leading-10">{assistant.emoji}</Text>
            <View className="min-w-0 flex-1 pr-4">
              <View className="gap-0.5">
                <Text className="font-semibold text-foreground text-lg" numberOfLines={1}>
                  {assistant.name}
                </Text>
                <Text className="text-foreground-muted text-xs" numberOfLines={1}>
                  {assistant.modelName ?? t('assistant.model.none')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </GestureDetector>
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
    transform: [{ translateX: drag.value + DELETE_ACTION_WIDTH }],
  }));

  return (
    <Animated.View className="h-full w-16" style={animatedStyle}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="w-16 flex-1 items-center justify-center bg-danger active:opacity-80"
        onPress={onPress}
      >
        <Trash2Icon className="size-5 text-danger-foreground" strokeWidth={2} />
      </Pressable>
    </Animated.View>
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
