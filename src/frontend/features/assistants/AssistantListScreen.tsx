import type { MenuItem } from '@cherrystudio/ui';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { Stack, useRouter } from 'expo-router';
import { BotIcon, CheckIcon, PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { useAlert } from '@/frontend/components/AlertProvider';
import { type HeaderToolbarAction, TabRootHeader } from '@/frontend/components/headers';
import {
  areAllSelected,
  toggleSelection,
  useMessageListBottomInset,
} from '@/frontend/components/messageTabs';
import { SelectionToolbar } from '@/frontend/components/messageTabs/SelectionToolbar/SelectionToolbar';
import { ContextMenuLink, useSetBottomTabBarHidden } from '@/frontend/components/navigation';
import { useAssistantMutations, useAssistantsApi } from '@/frontend/hooks/chat';

export default function AssistantListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assistants, isLoading } = useAssistantsApi();
  const { deleteAssistant, deleteAssistants } = useAssistantMutations();
  const { alert } = useAlert();
  const setBottomTabBarHidden = useSetBottomTabBarHidden();
  const bottomInset = useMessageListBottomInset();
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDeletionIds, setPendingDeletionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const isBatchDeleting = pendingDeletionIds.size > 0;

  const visibleAssistants = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? assistants
        : assistants.filter((assistant) => !pendingDeletionIds.has(assistant.id)),
    [assistants, pendingDeletionIds],
  );

  const filteredAssistants = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) {
      return visibleAssistants;
    }

    return visibleAssistants.filter((assistant) =>
      [assistant.name, assistant.modelName].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      ),
    );
  }, [searchText, visibleAssistants]);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'android') {
      return;
    }

    return () => setBottomTabBarHidden(false);
  }, [setBottomTabBarHidden]);

  const enterEditing = useCallback(() => {
    if (isBatchDeleting) {
      return;
    }

    setSearchText('');
    setIsEditing(true);
    if (process.env.EXPO_OS === 'android') {
      setBottomTabBarHidden(true);
    }
  }, [isBatchDeleting, setBottomTabBarHidden]);
  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedIds(new Set());
    if (process.env.EXPO_OS === 'android') {
      setBottomTabBarHidden(false);
    }
  }, [setBottomTabBarHidden]);
  const toggleAssistant = useCallback((assistantId: string) => {
    setSelectedIds((current) => toggleSelection(current, assistantId));
  }, []);
  const toggleAllAssistants = useCallback(() => {
    const assistantIds = visibleAssistants.map((assistant) => assistant.id);
    setSelectedIds((current) =>
      areAllSelected(current, assistantIds) ? new Set() : new Set(assistantIds),
    );
  }, [visibleAssistants]);

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
        disabled: visibleAssistants.length === 0 || isBatchDeleting,
        key: 'edit-assistants',
        label: t(isEditing ? 'common.done' : 'common.edit'),
        onPress: isEditing ? exitEditing : enterEditing,
      },
    ],
    [enterEditing, exitEditing, isBatchDeleting, isEditing, t, visibleAssistants.length],
  );
  const openAssistantEditor = useCallback(
    (assistantId: string) => {
      router.push({
        pathname: '/assistants/[assistantId]/edit',
        params: { assistantId },
      });
    },
    [router],
  );
  const requestDeleteAssistant = useCallback(
    (assistant: Assistant) => {
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('assistant.delete.message', { name: assistant.name }),
        role: 'destructive',
        title: t('assistant.delete.title'),
        onConfirm: () => {
          void deleteAssistant(assistant.id).catch(() => {
            alert.show({ title: t('assistant.toast.deleteFailed') });
          });
        },
      });
    },
    [alert, deleteAssistant, t],
  );
  const deleteSelectedAssistants = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return;
    }

    setPendingDeletionIds(new Set(ids));
    exitEditing();
    try {
      await deleteAssistants(ids);
    } catch {
      alert.show({ title: t('assistant.selection.deleteFailed') });
    } finally {
      setPendingDeletionIds(new Set());
    }
  }, [alert, deleteAssistants, exitEditing, selectedIds, t]);
  const requestDeleteSelectedAssistants = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t('assistant.selection.deleteMessage', { count: selectedIds.size }),
      onConfirm: deleteSelectedAssistants,
      role: 'destructive',
      title: t('assistant.selection.deleteTitle'),
    });
  }, [alert, deleteSelectedAssistants, selectedIds.size, t]);
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
      {process.env.EXPO_OS === 'ios' && !isEditing ? (
        <Stack.SearchBar
          autoCapitalize="none"
          hideNavigationBar={false}
          hideWhenScrolling={false}
          obscureBackground={false}
          placeholder={t('navigation.search')}
          placement="stacked"
          onCancelButtonPress={() => setSearchText('')}
          onChangeText={(event) => setSearchText(event.nativeEvent.text)}
        />
      ) : null}
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {filteredAssistants.length > 0 ? (
          <View>
            {filteredAssistants.map((assistant) => (
              <AssistantListRow
                key={assistant.id}
                assistant={assistant}
                isEditing={isEditing}
                isSelected={selectedIds.has(assistant.id)}
                onDelete={requestDeleteAssistant}
                onEdit={openAssistantEditor}
                onToggle={toggleAssistant}
              />
            ))}
          </View>
        ) : visibleAssistants.length === 0 ? (
          <AssistantEmptyState isLoading={isLoading} onCreate={openCreateAssistant} />
        ) : (
          <View className="items-center px-4 py-12">
            <Text className="text-sm text-muted-foreground">{t('assistant.list.noResults')}</Text>
          </View>
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
    </>
  );
}

type AssistantListRowProps = {
  assistant: Assistant;
  isEditing: boolean;
  isSelected: boolean;
  onDelete: (assistant: Assistant) => void;
  onEdit: (assistantId: string) => void;
  onToggle: (assistantId: string) => void;
};

function AssistantListRow({
  assistant,
  isEditing,
  isSelected,
  onDelete,
  onEdit,
  onToggle,
}: AssistantListRowProps) {
  const { t } = useTranslation();

  const handleDeletePress = useCallback(() => {
    onDelete(assistant);
  }, [assistant, onDelete]);
  const handleEditPress = useCallback(() => {
    onEdit(assistant.id);
  }, [assistant.id, onEdit]);
  const accessibilityActions = useMemo(
    () =>
      isEditing
        ? [{ name: 'activate' as const }]
        : [
            { label: t('common.edit'), name: 'edit' as const },
            { label: t('common.delete'), name: 'delete' as const },
          ],
    [isEditing, t],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (isEditing) {
        onToggle(assistant.id);
        return;
      }

      switch (event.nativeEvent.actionName) {
        case 'edit':
          handleEditPress();
          break;
        case 'delete':
          handleDeletePress();
          break;
        default:
          break;
      }
    },
    [assistant.id, handleDeletePress, handleEditPress, isEditing, onToggle],
  );
  const href = useMemo(
    () => ({
      pathname: '/assistants/[assistantId]' as const,
      params: { assistantId: assistant.id },
    }),
    [assistant.id],
  );
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'edit',
        label: t('common.edit'),
        onPress: handleEditPress,
        systemImage: 'pencil',
      },
      {
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
        role: 'destructive',
        systemImage: 'trash',
      },
    ],
    [handleDeletePress, handleEditPress, t],
  );

  const row = (
    <Pressable
      accessibilityActions={accessibilityActions}
      accessibilityLabel={assistant.name}
      accessibilityRole={isEditing ? 'checkbox' : 'link'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="w-full active:bg-secondary"
      onAccessibilityAction={handleAccessibilityAction}
      onPress={isEditing ? () => onToggle(assistant.id) : undefined}
    >
      <View className="relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b py-2 pl-2">
        {isEditing ? (
          <Animated.View entering={FadeInLeft.duration(160)} exiting={FadeOutLeft.duration(120)}>
            <View
              className={
                isSelected
                  ? 'size-6 items-center justify-center rounded-full bg-primary'
                  : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
              }
            >
              {isSelected ? (
                <CheckIcon className="size-4 text-primary-foreground" strokeWidth={3} />
              ) : null}
            </View>
          </Animated.View>
        ) : null}
        <Text className="min-w-12 text-center text-emoji-3xl">{assistant.emoji}</Text>
        <View className="min-w-0 flex-1 pr-4">
          <View className="gap-0.5">
            <Text className="font-semibold text-foreground text-base" numberOfLines={1}>
              {assistant.name}
            </Text>
            <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
              {assistant.modelName ?? t('assistant.model.none')}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );

  return isEditing ? (
    row
  ) : (
    <ContextMenuLink href={href} items={menuItems} preview={false}>
      {row}
    </ContextMenuLink>
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
      <View className="size-14 items-center justify-center rounded-full bg-secondary">
        <BotIcon className="size-7 text-foreground" strokeWidth={2} />
      </View>
      <View className="items-center gap-1">
        <Text className="text-center font-semibold text-foreground text-lg">
          {isLoading ? t('assistant.list.loading') : t('assistant.list.emptyTitle')}
        </Text>
        {!isLoading ? (
          <Text className="text-center text-foreground text-sm">
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
