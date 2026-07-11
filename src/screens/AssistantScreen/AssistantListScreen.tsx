import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { BotIcon, ChevronRightIcon, GlobeIcon, PlusIcon, StoreIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { AssistantCatalogSheet } from '@/components/assistantCatalog/AssistantCatalogSheet';
import type { AssistantCatalogPreset } from '@/data/presets/assistantCatalogService';
import { toCreateAssistantDtoFromCatalogPreset } from '@/data/presets/assistantCatalogService';
import type { Assistant } from '@/data/types/assistant';
import { useAssistantMutations, useAssistantsApi } from '@/hooks/chat';
import { useSettingsConfirmDialog } from '@/screens/SettingsScreen/hooks/useSettingsConfirmDialog';

const assistantCardMinHeight = 92;

export default function AssistantListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { assistants, isLoading } = useAssistantsApi();
  const { createAssistant, deleteAssistant } = useAssistantMutations();
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const { confirmDialog, requestConfirm } = useSettingsConfirmDialog();
  // MenuView (iOS) hosts each row in a SwiftUI `Host matchContents` that sizes to
  // the child's intrinsic width; without an explicit width the row's flex layout
  // collapses and the Pressable's hit area shrinks to its padding, so taps miss
  // (see DrawerTopicRow). Measure the list width and hand it to each row.
  const [rowWidth, setRowWidth] = useState(0);
  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;

    setRowWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  const openCreateAssistant = useCallback(() => {
    router.push('/assistants/edit');
  }, [router]);

  const openCatalog = useCallback(() => {
    setIsCatalogOpen(true);
  }, []);

  const closeCatalog = useCallback(() => {
    setIsCatalogOpen(false);
  }, []);

  const handleAddPreset = useCallback(
    async (preset: AssistantCatalogPreset) => {
      try {
        await createAssistant(toCreateAssistantDtoFromCatalogPreset(preset));
        toast.show({
          label: t('assistant.toast.addSuccess', { name: preset.name }),
          variant: 'success',
        });
      } catch {
        toast.show({
          label: t('assistant.toast.addFailed'),
          variant: 'danger',
        });
        throw new Error('addPreset failed');
      }
    },
    [createAssistant, t, toast],
  );

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('assistant.actions.catalog'),
        androidIcon: StoreIcon,
        icon: 'store',
        key: 'open-catalog',
        onPress: openCatalog,
      },
      {
        accessibilityLabel: t('assistant.actions.create'),
        androidIcon: PlusIcon,
        icon: 'plus',
        key: 'create-assistant',
        onPress: openCreateAssistant,
      },
    ],
    [openCatalog, openCreateAssistant, t],
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
      <BackHeader rightActions={rightActions} title={t('assistant.list.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {assistants.length > 0 ? (
          <View className="gap-3" onLayout={handleListLayout}>
            {assistants.map((assistant) => (
              <AssistantListRow
                key={assistant.id}
                assistant={assistant}
                width={rowWidth}
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
      <AssistantCatalogSheet
        isOpen={isCatalogOpen}
        onAddPreset={handleAddPreset}
        onClose={closeCatalog}
      />
    </>
  );
}

type AssistantListRowProps = {
  assistant: Assistant;
  onDelete: (assistant: Assistant) => void;
  onEdit: (assistantId: string) => void;
  width: number;
};

function AssistantListRow({ assistant, onDelete, onEdit, width }: AssistantListRowProps) {
  const { t } = useTranslation();
  const descriptionText = assistant.description || assistant.prompt;
  const actions = useMemo<MenuAction[]>(
    () => [
      { id: 'edit', image: 'pencil', title: t('common.edit') },
      {
        attributes: { destructive: true },
        id: 'delete',
        image: 'trash',
        title: t('common.remove'),
      },
    ],
    [t],
  );
  const handlePressAction = useCallback(
    (event: NativeActionEvent) => {
      const actionId = event.nativeEvent.event;

      if (actionId === 'edit') {
        onEdit(assistant.id);
        return;
      }

      if (actionId === 'delete') {
        onDelete(assistant);
      }
    },
    [assistant, onDelete, onEdit],
  );

  return (
    <MenuView actions={actions} onPressAction={handlePressAction} shouldOpenOnLongPress>
      <Pressable
        accessibilityLabel={assistant.name}
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-2xl border-continuous bg-settings-grouped-surface px-4 py-3 active:opacity-70"
        onPress={() => onEdit(assistant.id)}
        style={{ minHeight: assistantCardMinHeight, width: width || undefined }}
      >
        <View className="size-12 items-center justify-center rounded-full bg-surface-secondary">
          <Text className="text-2xl leading-7">{assistant.emoji || '🌟'}</Text>
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
          <View className="flex-row flex-wrap gap-1.5 pt-1">
            <AssistantBadge label={getAssistantSubtitle(assistant, t('assistant.model.none'))} />
            {assistant.settings.enableWebSearch ? (
              <AssistantBadge icon="web" label={t('assistant.list.webBadge')} />
            ) : null}
          </View>
        </View>
        <ChevronRightIcon className="size-5 text-default-foreground" strokeWidth={2.25} />
      </Pressable>
    </MenuView>
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

function getAssistantSubtitle(assistant: Assistant, fallback: string) {
  return assistant.modelName ?? assistant.modelId ?? fallback;
}
