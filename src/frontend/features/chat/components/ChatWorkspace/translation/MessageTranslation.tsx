import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  ActionMenu,
  BackgroundPressExclusion,
  Button,
  ContextMenuExclusion,
  MessagePart,
  useToast,
} from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDocumentExport } from '@/frontend/appShell/documentExport';
import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { MessageListItem } from '@/frontend/components/Message';
import { useTranslationLanguageMenu } from '@/frontend/hooks/useTranslationLanguageMenu';
import { APP_LANGUAGES, type AppLanguage } from '@/shared/utils/languages';

import { useMessageTranslation } from './MessageTranslationProvider';

export function MessageTranslationAction({ message }: { message: MessageListItem }) {
  const translation = useMessageTranslation(message);
  const { t } = useTranslation();
  const store = translation?.store;
  const source = translation?.source;
  const onSelect = useCallback(
    (language: AppLanguage) => {
      if (store && source) void store.start(source, language);
    },
    [source, store],
  );
  const items = useTranslationLanguageMenu({
    onSelect,
    selectedLanguage: translation?.state.language,
  });
  if (!translation) return null;
  const { state } = translation;
  const hasTranslation = state.status !== 'idle';
  const button = (
    <Button
      accessibilityLabel={t(
        hasTranslation
          ? state.visible
            ? 'chat.translation.hide'
            : 'chat.translation.show'
          : 'chat.translation.translate',
      )}
      accessibilityState={{
        busy: state.status === 'running',
        expanded: hasTranslation ? state.visible : undefined,
        selected: state.visible,
      }}
      icon={
        <LanguagesIcon
          className={state.visible ? 'text-primary' : 'text-muted-foreground'}
          size={15}
        />
      }
      onPress={hasTranslation ? () => translation.store.toggle(translation.source) : undefined}
      size="xs"
      testID="assistant-message-translate"
      variant="ghost"
    />
  );
  return hasTranslation ? button : <ActionMenu items={items}>{button}</ActionMenu>;
}

export function MessageTranslationContent({ message }: { message: MessageListItem }) {
  const translation = useMessageTranslation(message);
  const { open } = useDocumentExport();
  const { t } = useTranslation();
  const { toast } = useToast();
  const store = translation?.store;
  const source = translation?.source;
  const onSelect = useCallback(
    (language: AppLanguage) => {
      if (store && source) void store.start(source, language);
    },
    [source, store],
  );
  const items = useTranslationLanguageMenu({
    onSelect,
    selectedLanguage: translation?.state.language,
  });
  if (!translation?.state.visible) return null;
  const { state } = translation;
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(state.content);
      toast.show({ label: t('chat.messageActions.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('chat.messageActions.copyFailed'), variant: 'danger' });
    }
  };
  const share = async () => {
    try {
      const language = APP_LANGUAGES.find(({ value }) => value === state.language)?.label;
      const translationLabel = t('chat.translation.result', { language });
      const outcome = await open({
        input: {
          kind: 'document',
          document: {
            title: translationLabel,
            sections: [
              {
                id: `${message.id}:original`,
                heading: t('chat.translation.original'),
                presentation: 'message',
                blocks: [{ kind: 'markdown', source: translation.source.text }],
              },
              {
                id: `${message.id}:translation`,
                heading: translationLabel,
                presentation: 'message',
                blocks: [{ kind: 'markdown', source: state.content }],
              },
            ],
          },
        },
        initialFormat: 'image',
        allowedFormats: ['image', 'html', 'markdown'],
      });
      if (outcome === 'busy')
        toast.show({ label: t('documentExport.errors.busy'), variant: 'danger' });
    } catch {
      toast.show({ label: t('chat.translation.shareFailed'), variant: 'danger' });
    }
  };
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="w-full" testID="message-translation">
        <MessagePart.Translation>
          {state.status === 'running' && !state.content ? (
            <Text className="text-muted-foreground text-sm" accessibilityLiveRegion="polite">
              {t('chat.translation.translating')}
            </Text>
          ) : null}
          {state.content ? (
            <MarkdownText isStreaming={state.status === 'running'} markdown={state.content} />
          ) : null}
          {state.status === 'error' || state.status === 'cancelled' ? (
            <Text className="text-muted-foreground text-sm" accessibilityLiveRegion="polite">
              {t(
                state.status === 'cancelled'
                  ? 'chat.translation.cancelled'
                  : state.error === 'model-unavailable'
                    ? 'translation.error.modelUnavailable'
                    : 'translation.error.failed',
              )}
            </Text>
          ) : null}
          <View className="min-h-7 flex-row items-center gap-1">
            {state.status === 'running' ? (
              <Button
                accessibilityLabel={t('common.cancel')}
                icon={<XIcon className="text-muted-foreground" size={15} />}
                onPress={() => translation.store.cancel(translation.source.messageId)}
                size="xs"
                variant="ghost"
              />
            ) : null}
            {state.status === 'error' || state.status === 'cancelled' ? (
              <Button
                accessibilityLabel={t('common.retry')}
                icon={<RotateCcwIcon className="text-muted-foreground" size={15} />}
                onPress={() => {
                  if (state.language)
                    void translation.store.start(translation.source, state.language);
                }}
                size="xs"
                variant="ghost"
              />
            ) : null}
            {state.status === 'success' ? (
              <Button
                accessibilityLabel={t('chat.translation.copy')}
                icon={<CopyIcon className="text-muted-foreground" size={15} />}
                onPress={() => void copy()}
                size="xs"
                testID="message-translation-copy"
                variant="ghost"
              />
            ) : null}
            <ActionMenu items={items}>
              <Button
                accessibilityLabel={t('chat.translation.switchLanguage')}
                icon={<LanguagesIcon className="text-muted-foreground" size={15} />}
                size="xs"
                testID="message-translation-language-menu"
                variant="ghost"
              />
            </ActionMenu>
            {state.status === 'success' ? (
              <Button
                accessibilityLabel={t('chat.translation.share')}
                icon={<ShareIcon className="text-muted-foreground" size={15} />}
                onPress={() => void share()}
                size="xs"
                testID="message-translation-share"
                variant="ghost"
              />
            ) : null}
          </View>
        </MessagePart.Translation>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
