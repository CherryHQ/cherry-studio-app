import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { BotIcon, CheckIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeInLeft,
  FadeOutLeft,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { useConfirmDialog } from '@/frontend/components/confirmDialog';
import { type HeaderToolbarAction, TabRootHeader } from '@/frontend/components/headers';
import {
  areAllSelected,
  toggleSelection,
  useMessageListBottomInset,
} from '@/frontend/components/messageTabs';
import { SelectionToolbar } from '@/frontend/components/messageTabs/SelectionToolbar/SelectionToolbar';
import { useSetBottomTabBarHidden } from '@/frontend/components/navigation';
import { useAssistantMutations, useAssistantsApi } from '@/frontend/hooks/chat';
import { useExclusiveSwipeable } from '@/frontend/hooks/useExclusiveSwipeable';
import type { Assistant } from '@/shared/data/types/assistant';

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
  const setBottomTabBarHidden = useSetBottomTabBarHidden();
  const bottomInset = useMessageListBottomInset();
  const [isEditing, setIsEditing] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (process.env.EXPO_OS !== 'android') {
      return;
    }

    setBottomTabBarHidden(isEditing);
    return () => setBottomTabBarHidden(false);
  }, [isEditing, setBottomTabBarHidden]);

  const enterEditing = useCallback(() => {
    setIsEditing(true);
  }, []);
  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedIds(new Set());
  }, []);
  const toggleAssistant = useCallback((assistantId: string) => {
    setSelectedIds((current) => toggleSelection(current, assistantId));
  }, []);
  const toggleAllAssistants = useCallback(() => {
    const assistantIds = assistants.map((assistant) => assistant.id);
    setSelectedIds((current) =>
      areAllSelected(current, assistantIds) ? new Set() : new Set(assistantIds),
    );
  }, [assistants]);

  const openCreateAssistant = useCallback(() => {
    router.push('/assistants/new');
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
  const leftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t(isEditing ? 'common.done' : 'common.edit'),
        disabled: assistants.length === 0 || isBatchDeleting,
        key: 'edit-assistants',
        label: t(isEditing ? 'common.done' : 'common.edit'),
        onPress: isEditing ? exitEditing : enterEditing,
      },
    ],
    [assistants.length, enterEditing, exitEditing, isBatchDeleting, isEditing, t],
  );
  const openAssistantDetail = useCallback(
    (assistantId: string) => {
      router.push({
        pathname: '/assistants/[assistantId]',
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
  const deleteSelectedAssistants = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return;
    }

    setIsBatchDeleting(true);
    try {
      await Promise.all(ids.map((assistantId) => deleteAssistant(assistantId)));
      exitEditing();
    } catch {
      toast.show({
        label: t('assistant.selection.deleteFailed'),
        variant: 'danger',
      });
    } finally {
      setIsBatchDeleting(false);
    }
  }, [deleteAssistant, exitEditing, selectedIds, t, toast]);
  const requestDeleteSelectedAssistants = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    requestConfirm({
      message: t('assistant.selection.deleteMessage', { count: selectedIds.size }),
      onConfirm: deleteSelectedAssistants,
      title: t('assistant.selection.deleteTitle'),
    });
  }, [deleteSelectedAssistants, requestConfirm, selectedIds.size, t]);
  const scrollContentStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: 8 }),
    [bottomInset],
  );

  return (
    <>
      <TabRootHeader
        leftActions={leftActions}
        rightActions={isEditing ? undefined : rightActions}
        title={t('assistant.list.title')}
      />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {assistants.length > 0 ? (
          <View>
            {assistants.map((assistant, index) => (
              <AssistantListRow
                key={assistant.id}
                assistant={assistant}
                isEditing={isEditing}
                isLast={index === assistants.length - 1}
                isSelected={selectedIds.has(assistant.id)}
                notifyClose={notifyClose}
                notifyWillOpen={notifyWillOpen}
                onDelete={requestDeleteAssistant}
                onOpen={openAssistantDetail}
                onToggle={toggleAssistant}
              />
            ))}
          </View>
        ) : (
          <AssistantEmptyState isLoading={isLoading} onCreate={openCreateAssistant} />
        )}
      </ScrollView>
      {isEditing ? (
        <SelectionToolbar
          isDeleting={isBatchDeleting}
          onDelete={requestDeleteSelectedAssistants}
          onToggleAll={toggleAllAssistants}
          selectedCount={selectedIds.size}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}

type AssistantListRowProps = {
  assistant: Assistant;
  isEditing: boolean;
  isLast: boolean;
  isSelected: boolean;
  notifyClose: (swipeable: SwipeableMethods) => void;
  notifyWillOpen: (swipeable: SwipeableMethods) => void;
  onDelete: (assistant: Assistant) => void;
  onOpen: (assistantId: string) => void;
  onToggle: (assistantId: string) => void;
};

function AssistantListRow({
  assistant,
  isEditing,
  isLast,
  isSelected,
  notifyClose,
  notifyWillOpen,
  onDelete,
  onOpen,
  onToggle,
}: AssistantListRowProps) {
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const isSwipeOpen = useSharedValue(0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    if (isEditing) {
      swipeableRef.current?.close();
    }
  }, [isEditing]);

  const handleDeletePress = useCallback(() => {
    swipeableRef.current?.close();
    onDelete(assistant);
  }, [assistant, onDelete]);
  const handlePress = useCallback(() => {
    if (isEditing) {
      onToggle(assistant.id);
      return;
    }

    onOpen(assistant.id);
  }, [assistant.id, isEditing, onOpen, onToggle]);
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
  const openTapGesture = useMemo(
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
            runOnJS(handlePress)();
          }
        }),
    [handlePress, isSwipeOpen, pressProgress],
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
      enabled={!isEditing}
      friction={2}
      onSwipeableClose={handleSwipeableClose}
      onSwipeableOpenStartDrag={handleSwipeableOpenStartDrag}
      onSwipeableWillOpen={handleSwipeableWillOpen}
      overshootRight={false}
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      simultaneousWithExternalGesture={openTapGesture}
    >
      <GestureDetector gesture={openTapGesture}>
        <View
          accessibilityActions={ASSISTANT_ROW_ACCESSIBILITY_ACTIONS}
          accessibilityLabel={assistant.name}
          accessibilityRole={isEditing ? 'checkbox' : 'button'}
          accessibilityState={isEditing ? { checked: isSelected } : undefined}
          accessible
          onAccessibilityAction={handlePress}
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
                  ? isEditing
                    ? 'absolute inset-y-0 right-0 left-24 border-border border-y'
                    : 'absolute inset-y-0 right-0 left-16 border-border border-y'
                  : isEditing
                    ? 'absolute top-0 right-0 left-24 border-border border-t'
                    : 'absolute top-0 right-0 left-16 border-border border-t'
              }
              pointerEvents="none"
              style={borderStyle}
            />
            {isEditing ? (
              <Animated.View
                entering={FadeInLeft.duration(160)}
                exiting={FadeOutLeft.duration(120)}
              >
                <View
                  className={
                    isSelected
                      ? 'size-6 items-center justify-center rounded-full bg-primary'
                      : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
                  }
                >
                  {isSelected ? <CheckIcon className="size-4 text-white" strokeWidth={3} /> : null}
                </View>
              </Animated.View>
            ) : null}
            <Text className="min-w-12 h-12 text-center text-3xl leading-12">{assistant.emoji}</Text>
            <View className="min-w-0 flex-1 pr-4">
              <View className="gap-0.5">
                <Text className="font-semibold text-foreground text-md" numberOfLines={1}>
                  {assistant.name}
                </Text>
                <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
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
