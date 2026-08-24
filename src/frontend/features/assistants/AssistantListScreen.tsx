import BotIcon from '@cherrystudio/app-icons/icons/bot';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { ContentState, type MenuItem, useAlert } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AccessibilityActionEvent, ScrollView, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import {
  areAllSelected,
  SelectionToolbar,
  toggleSelection,
  useListBottomInset,
} from '@/frontend/components/selection';
import { useAssistantMutations, useAssistantsApi } from '@/frontend/hooks/chat';
import type { Assistant } from '@/shared/data/types/assistant';

import { AssistantListSearchBar } from './AssistantListSearchBar/AssistantListSearchBar';

export default function AssistantListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { assistants, isLoading } = useAssistantsApi();
  const { deleteAssistant, deleteAssistants } = useAssistantMutations();
  const { alert } = useAlert();
  const bottomInset = useListBottomInset();
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

  const enterEditing = useCallback(() => {
    if (isBatchDeleting) {
      return;
    }

    setSearchText('');
    setIsEditing(true);
  }, [isBatchDeleting]);
  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedIds(new Set());
  }, []);
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
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'create-assistant',
        label: t('assistant.actions.add'),
        onPress: openCreateAssistant,
      },
      {
        disabled: visibleAssistants.length === 0 || isBatchDeleting,
        id: 'select-assistants',
        label: t('assistant.selection.start'),
        onPress: enterEditing,
      },
    ],
    [enterEditing, isBatchDeleting, openCreateAssistant, t, visibleAssistants.length],
  );
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'assistant-actions',
        type: 'menu',
      },
    ],
    [menuItems, t],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        key: 'finish-selecting-assistants',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, t],
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
      <RouteHeader
        rightActions={isEditing ? doneActions : rightActions}
        title={t('assistant.list.title')}
      />
      <AssistantListSearchBar isEditing={isEditing} setSearchText={setSearchText} />
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
          isLoading ? (
            <ContentState.Loading className="px-8 py-16" title={t('assistant.list.loading')} />
          ) : (
            <ContentState.Empty
              className="px-8 py-16"
              description={t('assistant.list.emptyDescription')}
              icon={
                <View className="size-14 items-center justify-center rounded-full bg-secondary">
                  <BotIcon className="size-7 text-foreground" />
                </View>
              }
              primaryAction={{
                accessibilityLabel: t('assistant.actions.create'),
                children: t('assistant.actions.create'),
                className: 'rounded-full',
                onPress: openCreateAssistant,
                size: 'default',
              }}
              title={t('assistant.list.emptyTitle')}
            />
          )
        ) : (
          <ContentState.Empty className="px-4 py-12" description={t('assistant.list.noResults')} />
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
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        id: 'edit',
        label: t('common.edit'),
        onPress: handleEditPress,
      },
      {
        destructive: true,
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
      },
    ],
    [handleDeletePress, handleEditPress, t],
  );

  const row = (
    <GesturePressable
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
                  ? 'size-6 items-center justify-center rounded-full bg-foreground'
                  : 'size-6 items-center justify-center rounded-full border-2 border-border-strong'
              }
            >
              {isSelected ? <CheckIcon className="size-4 text-background" /> : null}
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
    </GesturePressable>
  );

  return isEditing ? (
    row
  ) : (
    <ContextMenuLink href={href} items={menuItems} preview={false}>
      {row}
    </ContextMenuLink>
  );
}
