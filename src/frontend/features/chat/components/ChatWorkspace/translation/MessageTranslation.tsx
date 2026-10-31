import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
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

import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { MessageListItem } from '@/frontend/components/Message';
import { useTranslationLanguageMenu } from '@/frontend/hooks/useTranslationLanguageMenu';
import type { AppLanguage } from '@/shared/utils/languages';

import { useMessageTranslation } from './MessageTranslationProvider';

export function MessageTranslationContent({ message }: { message: MessageListItem }) {
  const translation = useMessageTranslation(message);
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
            <Button
              accessibilityLabel={t('chat.translation.hide')}
              icon={<ChevronUpIcon className="text-muted-foreground" size={15} />}
              onPress={() => translation.store.toggle(translation.source)}
              size="xs"
              testID="message-translation-collapse"
              variant="ghost"
            />
          </View>
        </MessagePart.Translation>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
