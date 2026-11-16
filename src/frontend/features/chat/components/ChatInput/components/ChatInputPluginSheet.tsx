import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type ViewInstance } from 'react-native';

import { useComposerMeta, useComposerState } from '@/frontend/components/Composer';
import { PluginIcon } from '@/frontend/components/PluginIcon';

import type { ChatInputPlugin } from '../utils/chatInputPlugins';
import { createMentionLabel } from '../utils/mentionLabels';
import { createPluginMentionUrl, readPluginMentions } from '../utils/pluginMentions';

type ChatInputPluginSheetProps = {
  onConnect: () => void;
  onClose: () => void;
  onClosed?: () => void;
  onSelect: () => void;
  open: boolean;
  plugins: readonly ChatInputPlugin[];
  returnFocusRef?: RefObject<ViewInstance | null>;
};

/** Reads composer context here; the portal receives presentation and callbacks only. */
export function ChatInputPluginSheet({
  onClose,
  onClosed,
  onConnect,
  onSelect,
  open,
  plugins,
  returnFocusRef,
}: ChatInputPluginSheetProps) {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();
  const { draft } = useComposerState();
  const initialFocusRef = useRef<ViewInstance>(null);
  const selectionAccepted = useRef(false);
  useEffect(() => {
    if (!open) return;
    selectionAccepted.current = false;
  }, [open]);
  useFocusEffect(
    useCallback(
      () => () => {
        onClose();
      },
      [onClose],
    ),
  );
  const selectedIds = new Set(readPluginMentions(draft).pluginServerIds);

  function select(plugin: ChatInputPlugin) {
    if (!open || selectionAccepted.current) return;
    selectionAccepted.current = true;
    if (!selectedIds.has(plugin.serverId)) {
      inputRef.current?.insertLink(
        createMentionLabel(t(`plugins.catalog.${plugin.id}.name`)),
        createPluginMentionUrl(plugin.serverId, plugin.id),
      );
      inputRef.current?.insertText(' ');
    }
    onSelect();
  }

  // Keyboard taps stay with the list. A vertical drag cancels its candidate row
  // press; rows only select on release and have no competing long-press action.
  const content = (
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="gap-1 px-5 py-2"
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
    >
      {plugins.length === 0 ? (
        <View className="gap-2 px-3 py-2">
          <Text className="text-sm text-muted-foreground">{t('plugins.composer.empty')}</Text>
        </View>
      ) : null}
      {plugins.map((plugin, index) => {
        const isSelected = selectedIds.has(plugin.serverId);
        const name = t(`plugins.catalog.${plugin.id}.name`);
        return (
          <Pressable
            accessibilityLabel={name}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="min-h-14 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active"
            key={plugin.id}
            onPress={() => select(plugin)}
            ref={index === 0 ? initialFocusRef : undefined}
            testID={`chat-plugin-${plugin.id}`}
          >
            <PluginIcon icon={plugin.icon} size="small" />
            <Text className="min-w-0 flex-1 text-base text-foreground">{name}</Text>
            {isSelected && <CheckIcon className="size-5 text-primary" />}
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <BottomSheet
      footer={
        <Button onPress={onConnect} testID="chat-plugin-add">
          {t('plugins.composer.add')}
        </Button>
      }
      onClosed={onClosed}
      initialFocusRef={initialFocusRef}
      onClose={onClose}
      open={open}
      presentation="overlay"
      returnFocusRef={returnFocusRef}
      sizes={['large', 'full']}
      testID="chat-plugin-sheet"
      title={t('plugins.title')}
    >
      {content}
    </BottomSheet>
  );
}
