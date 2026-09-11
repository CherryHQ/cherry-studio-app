import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, Composer, ContentState, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  useComposerMeta,
  useComposerPresentationActions,
  useComposerState,
} from '@/frontend/components/Composer';
import { PluginIcon, usePluginCatalog, usePluginConnections } from '@/frontend/features/plugin';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { PluginCatalogEntry } from '@/shared/data/types/plugin';

import { createPluginMentionUrl, readPluginMentions } from '../utils/pluginMentions';

const logger = loggerService.withContext('ChatInputPluginPopover');

type ChatInputPluginPopoverProps = {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<View | null>;
};

/** Reads route and composer context here; the portal receives presentation and callbacks only. */
export function ChatInputPluginPopover({
  children,
  onClose,
  open,
  returnFocusRef,
}: ChatInputPluginPopoverProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const catalog = usePluginCatalog();
  const connections = usePluginConnections();
  const { inputRef } = useComposerMeta();
  const { runInputReplacement } = useComposerPresentationActions();
  const { draft } = useComposerState();
  const initialFocusRef = useRef<View>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const selectionAccepted = useRef(false);
  const routeGeneration = useRef(0);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(true);
  useEffect(() => {
    if (!open) return;
    selectionAccepted.current = false;
  }, [open]);
  useFocusEffect(
    useCallback(
      () => () => {
        routeGeneration.current++;
        afterClose.current = null;
        setShouldRestoreFocus(false);
        onClose();
      },
      [onClose],
    ),
  );
  const selectedIds = new Set(readPluginMentions(draft).pluginServerIds);
  const entries = catalog.data ?? [];

  function close(reason: 'outside' | 'anchor' | 'back' = 'outside') {
    // A touch on the composer owns its next focus/action, including during exit.
    setShouldRestoreFocus(reason !== 'anchor');
    afterClose.current = null;
    onClose();
  }

  function finishClose() {
    const action = afterClose.current;
    afterClose.current = null;
    action?.();
  }

  function select(entry: PluginCatalogEntry) {
    if (!open || selectionAccepted.current) return;
    selectionAccepted.current = true;
    const connection = connections.data?.find((item) => item.pluginId === entry.id);
    if (
      !connection ||
      (connection.authorization && connection.authorization.status !== 'connected')
    ) {
      setShouldRestoreFocus(false);
      afterClose.current = () => {
        const generation = routeGeneration.current;
        void runInputReplacement(() => {
          if (generation !== routeGeneration.current) return;
          router.push({ pathname: '/plugins/[pluginId]/connect', params: { pluginId: entry.id } });
        }).catch((error: unknown) => {
          logger.warn(
            'Plugin connection page failed to open',
            error instanceof Error ? error : { error },
          );
          toast.show({ label: t('chat.plugins.openFailed'), variant: 'danger' });
        });
      };
      onClose();
      return;
    }
    setShouldRestoreFocus(true);
    if (!selectedIds.has(connection.serverId)) {
      inputRef.current?.insertLink(
        t(`plugins.catalog.${entry.id}.name`),
        createPluginMentionUrl(connection.serverId),
      );
      inputRef.current?.insertText(' ');
    }
    inputRef.current?.focus();
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
      {catalog.isLoading || connections.isLoading ? (
        <View accessible accessibilityLabel={t('plugins.loading')} focusable ref={initialFocusRef}>
          <ContentState.Loading layout="row" title={t('plugins.loading')} />
        </View>
      ) : catalog.isError || connections.isError ? (
        <View className="items-center gap-2 p-2">
          <ContentState.Error title={t('plugins.loadFailed')} />
          <Button
            onPress={() => void Promise.all([catalog.refetch(), connections.refetch()])}
            ref={initialFocusRef}
          >
            {t('common.retry')}
          </Button>
        </View>
      ) : entries.length === 0 ? (
        <View
          accessible
          accessibilityLabel={t('chat.plugins.empty')}
          focusable
          ref={initialFocusRef}
        >
          <ContentState.Empty title={t('chat.plugins.empty')} />
        </View>
      ) : (
        entries.map((entry, index) => {
          const connection = connections.data?.find((item) => item.pluginId === entry.id);
          const isConnected =
            Boolean(connection) &&
            (!connection?.authorization || connection.authorization.status === 'connected');
          const isSelected = Boolean(connection && selectedIds.has(connection.serverId));
          const name = t(`plugins.catalog.${entry.id}.name`);
          return (
            <Pressable
              accessibilityHint={
                isConnected ? undefined : t(connection ? 'plugins.reconnect' : 'plugins.connect')
              }
              accessibilityLabel={name}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active"
              key={entry.id}
              onPress={() => select(entry)}
              ref={index === 0 ? initialFocusRef : undefined}
              testID={`chat-plugin-${entry.id}`}
            >
              <PluginIcon icon={entry.icon} size="small" />
              <Text className="min-w-0 flex-1 text-base text-foreground">{name}</Text>
              {isSelected ? (
                <CheckIcon className="size-5 text-primary" />
              ) : (
                <ChevronRightIcon className="size-5 text-muted-foreground" />
              )}
            </Pressable>
          );
        })
      )}
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
      onClosed={finishClose}
      open={open}
      returnFocusRef={shouldRestoreFocus ? returnFocusRef : undefined}
      testID="chat-plugin-popover"
    >
      {children}
    </Composer.Popover>
  );
}
