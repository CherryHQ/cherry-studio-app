import CheckIcon from '@cherrystudio/app-icons/icons/check';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import {
  BackgroundPressExclusion,
  Button,
  ContextMenuExclusion,
  MessagePart,
  useToast,
} from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import type { MessageListItem } from '@/frontend/components/Message';

import { useMessageTranslation } from './MessageTranslationProvider';

export function MessageTranslationAction({ message }: { message: MessageListItem }) {
  const translation = useMessageTranslation(message);
  const { t } = useTranslation();
  if (!translation) return null;
  const { state, source, store } = translation;
  return (
    <Button
      accessibilityLabel={t(state.visible ? 'chat.translation.hide' : 'chat.translation.translate')}
      accessibilityState={{ expanded: state.visible, busy: state.status === 'running' }}
      icon={
        state.status === 'success' ? (
          <CheckIcon className="text-muted-foreground" size={15} />
        ) : (
          <LanguagesIcon className="text-muted-foreground" size={15} />
        )
      }
      onPress={() => store.toggle(source)}
      size="xs"
      testID="assistant-message-translate"
      variant="ghost"
    />
  );
}

export function MessageTranslationContent({ message }: { message: MessageListItem }) {
  const translation = useMessageTranslation(message);
  const { t } = useTranslation();
  const { toast } = useToast();
  if (!translation?.state.visible) return null;
  const { state, source, store } = translation;
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
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-muted-foreground text-xs" accessibilityLiveRegion="polite">
              {t(
                state.status === 'running'
                  ? 'chat.translation.translating'
                  : 'chat.translation.title',
              )}
            </Text>
            <View className="flex-row items-center gap-1">
              {state.status === 'running' ? (
                <Button onPress={() => store.cancel(source.messageId)} size="xs" variant="ghost">
                  {t('common.cancel')}
                </Button>
              ) : null}
              {state.status === 'success' ? (
                <Button onPress={() => void copy()} size="xs" variant="ghost">
                  {t('common.copy')}
                </Button>
              ) : null}
              <Button onPress={() => store.toggle(source)} size="xs" variant="ghost">
                {t('chat.translation.hide')}
              </Button>
            </View>
          </View>
          {state.content ? (
            <MarkdownText isStreaming={state.status === 'running'} markdown={state.content} />
          ) : null}
          {state.status === 'error' || state.status === 'cancelled' ? (
            <View className="items-start gap-2">
              <Text className="text-muted-foreground text-sm" accessibilityLiveRegion="polite">
                {t(
                  state.status === 'cancelled'
                    ? 'chat.translation.cancelled'
                    : state.error === 'model-unavailable'
                      ? 'translation.error.modelUnavailable'
                      : 'translation.error.failed',
                )}
              </Text>
              <Button onPress={() => void store.start(source)} size="xs" variant="ghost">
                {t('common.retry')}
              </Button>
            </View>
          ) : null}
        </MessagePart.Translation>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
