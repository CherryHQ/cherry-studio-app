import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Composer, ContentState, SearchField, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, type TextInput, View } from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';

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
  const { resumeKeyboardTracking, runInputReplacement } = useComposerPresentationActions();
  const { draft } = useComposerState();
  const [search, setSearch] = useState('');
  const searchRef = useRef<TextInput>(null);
  const closeButtonRef = useRef<View>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const selectionAccepted = useRef(false);
  const hasShownKeyboard = useRef(false);
  const routeGeneration = useRef(0);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(true);
  useEffect(() => {
    if (!open) return;
    selectionAccepted.current = false;
    hasShownKeyboard.current = KeyboardController.isVisible();
    const listener = KeyboardEvents.addListener('keyboardWillShow', () => {
      hasShownKeyboard.current = true;
    });
    return () => listener.remove();
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
  const query = search.trim().toLocaleLowerCase();
  const selectedIds = new Set(readPluginMentions(draft).pluginServerIds);
  const entries = (catalog.data ?? []).filter((entry) =>
    [t(`plugins.catalog.${entry.id}.name`), t(`plugins.catalog.${entry.id}.summary`)].some((text) =>
      text.toLocaleLowerCase().includes(query),
    ),
  );

  function dismiss() {
    setSearch('');
    onClose();
  }

  function close(reason: 'outside' | 'anchor' | 'back' = 'outside') {
    // A touch on the composer owns its next focus/action, including during exit.
    setShouldRestoreFocus(reason !== 'anchor');
    afterClose.current = null;
    if (
      reason !== 'anchor' &&
      searchRef.current?.isFocused() &&
      (KeyboardController.isVisible() || !hasShownKeyboard.current)
    ) {
      // Transfer native focus while the search field still exists, preserving
      // the keyboard. Accessibility focus returns separately after dismissal.
      inputRef.current?.focus();
    }
    dismiss();
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
      dismiss();
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
    dismiss();
  }

  // Keyboard taps stay with the list. A vertical drag cancels its candidate row
  // press; rows only select on release and have no competing long-press action.
  const content = (
    <ScrollView
      className="shrink"
      contentContainerClassName="gap-2 p-3"
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
    >
      <View className="flex-row items-center gap-2">
        <Text accessibilityRole="header" className="flex-1 text-base font-semibold text-foreground">
          {t('plugins.title')}
        </Text>
        <Button
          accessibilityLabel={t('common.close')}
          icon={<XIcon />}
          onPress={() => close()}
          ref={closeButtonRef}
          size="lg"
          variant="ghost"
        />
      </View>
      <SearchField
        accessibilityLabel={t('chat.plugins.search')}
        clearAccessibilityLabel={t('common.clear')}
        onChangeText={setSearch}
        onClear={() => setSearch('')}
        onFocus={resumeKeyboardTracking}
        placeholder={t('chat.plugins.search')}
        ref={searchRef}
        testID="chat-plugin-search"
        value={search}
      />
      <View>
        {catalog.isLoading || connections.isLoading ? (
          <ContentState.Loading title={t('plugins.loading')} />
        ) : catalog.isError || connections.isError ? (
          <ContentState.Error
            title={t('plugins.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void Promise.all([catalog.refetch(), connections.refetch()]),
            }}
          />
        ) : entries.length === 0 ? (
          <ContentState.Empty title={t('chat.plugins.empty')} />
        ) : (
          entries.map((entry) => {
            const connection = connections.data?.find((item) => item.pluginId === entry.id);
            const isConnected =
              Boolean(connection) &&
              (!connection?.authorization || connection.authorization.status === 'connected');
            const isSelected = Boolean(connection && selectedIds.has(connection.serverId));
            const name = t(`plugins.catalog.${entry.id}.name`);
            const description = isConnected
              ? t(`plugins.catalog.${entry.id}.summary`)
              : connection
                ? t('plugins.reconnect')
                : t('chat.plugins.connectToUse');
            return (
              <Pressable
                accessibilityLabel={`${name}, ${description}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="min-h-16 flex-row items-center gap-3 rounded-xl px-1 py-3 active:bg-secondary-active"
                key={entry.id}
                onPress={() => select(entry)}
                testID={`chat-plugin-${entry.id}`}
              >
                <PluginIcon icon={entry.icon} />
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-base font-medium text-foreground">{name}</Text>
                  <Text className="text-sm text-muted-foreground">{description}</Text>
                </View>
                {isSelected ? (
                  <CheckIcon className="size-5 text-primary" />
                ) : (
                  <ChevronRightIcon className="size-5 text-muted-foreground" />
                )}
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  return (
    <Composer.Popover
      accessibilityLabel={t('plugins.title')}
      content={content}
      initialFocusRef={closeButtonRef}
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
