import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { Composer } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useComposerMeta, useComposerState } from '@/frontend/components/Composer';
import { PluginIcon } from '@/frontend/features/plugin';

import type { ChatInputPlugin } from '../utils/chatInputPlugins';
import {
  createPluginMentionLabel,
  createPluginMentionUrl,
  readPluginMentions,
} from '../utils/pluginMentions';

type ChatInputPluginPopoverProps = {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  plugins: readonly ChatInputPlugin[];
  returnFocusRef?: RefObject<View | null>;
};

/** Reads composer context here; the portal receives presentation and callbacks only. */
export function ChatInputPluginPopover({
  children,
  onClose,
  open,
  plugins,
  returnFocusRef,
}: ChatInputPluginPopoverProps) {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();
  const { draft } = useComposerState();
  const initialFocusRef = useRef<View>(null);
  const selectionAccepted = useRef(false);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(true);
  useEffect(() => {
    if (!open) return;
    selectionAccepted.current = false;
  }, [open]);
  useFocusEffect(
    useCallback(
      () => () => {
        setShouldRestoreFocus(false);
        onClose();
      },
      [onClose],
    ),
  );
  const selectedIds = new Set(readPluginMentions(draft).pluginServerIds);

  function close(reason: 'outside' | 'anchor' | 'back' = 'outside') {
    // A touch on the composer owns its next focus/action, including during exit.
    setShouldRestoreFocus(reason !== 'anchor');
    onClose();
  }

  function select(plugin: ChatInputPlugin) {
    if (!open || selectionAccepted.current) return;
    selectionAccepted.current = true;
    setShouldRestoreFocus(true);
    if (!selectedIds.has(plugin.serverId)) {
      inputRef.current?.insertLink(
        createPluginMentionLabel(t(`plugins.catalog.${plugin.id}.name`)),
        createPluginMentionUrl(plugin.serverId, plugin.id),
      );
      inputRef.current?.insertText(' ');
    }
    onClose();
  }

  // Keyboard taps stay with the list. A vertical drag cancels its candidate row
  // press; rows only select on release and have no competing long-press action.
  const content = (
    <ScrollView
      className="grow-0 shrink"
      contentContainerClassName="gap-0.5 p-2"
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
    >
      {plugins.length === 0 ? (
        <Text className="p-3 text-sm text-muted-foreground">
          {t('chat.input.pluginsUnavailable')}
        </Text>
      ) : null}
      {plugins.map((plugin, index) => {
        const isSelected = selectedIds.has(plugin.serverId);
        const name = t(`plugins.catalog.${plugin.id}.name`);
        return (
          <Pressable
            accessibilityLabel={name}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active"
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
    <Composer.Popover
      accessibilityLabel={t('plugins.title')}
      content={content}
      initialFocusRef={initialFocusRef}
      maxHeight={320}
      maxWidth={280}
      onClose={close}
      open={open}
      returnFocusRef={shouldRestoreFocus ? returnFocusRef : undefined}
      testID="chat-plugin-popover"
    >
      {children}
    </Composer.Popover>
  );
}
