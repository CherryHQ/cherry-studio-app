import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import {
  BackgroundPressExclusion,
  Button,
  ContextMenuExclusion,
} from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { AssistantMessage, type MessageListItem } from '@/frontend/components/Message';
import { usePreference } from '@/frontend/data/hooks';

import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { MessageAnswerCards, useAnswerGroup } from './MessageAnswerCards';

/** Selects the presentation while leaving answer selection and message content with their owners. */
export function MessageAnswerGroup({
  children,
  message,
}: PropsWithChildren<{ message: MessageListItem }>) {
  const [areCardsEnabled] = usePreference('chat.multi_model.cards_enabled');

  if (areCardsEnabled) {
    return (
      <>
        <MessageAnswerCards message={message} />
        <View className="w-full gap-2">{children}</View>
      </>
    );
  }

  return (
    <>
      <AnswerNavigation message={message} />
      <AssistantMessage message={message}>{children}</AssistantMessage>
    </>
  );
}

function AnswerNavigation({ message }: { message: MessageListItem }) {
  const { t, i18n } = useTranslation();
  const { selectBranch } = useAssistantMessageActions();
  const { models, names, siblings } = useAnswerGroup(message);
  const index = Math.max(
    0,
    siblings.findIndex((sibling) => sibling.id === message.id),
  );
  const model = models[index];
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const show = (targetIndex: number) => {
    const target = siblings[targetIndex];
    if (target && selectBranch) {
      void selectBranch({ messageId: message.id, targetId: target.id });
    }
  };

  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="w-full flex-row items-center gap-2">
        {model ? <ModelAvatar model={model.model} provider={model.provider} size={24} /> : null}
        <Text className="min-w-0 flex-1 font-semibold text-foreground text-sm" numberOfLines={1}>
          {names[index]}
        </Text>
        <View className="flex-row items-center" testID="message-answer-navigation">
          <Button
            accessibilityLabel={t('chat.branch.previous')}
            disabled={!selectBranch || index === 0}
            icon={<ChevronLeftIcon className="size-4 text-muted-foreground" />}
            onPress={() => show(index - 1)}
            size="xs"
            testID="message-answer-previous"
            variant="ghost"
          />
          <Text
            accessibilityLabel={t('chat.branch.page', {
              index: index + 1,
              total: siblings.length,
              model: names[index],
            })}
            accessibilityLiveRegion="polite"
            className="text-muted-foreground text-xs tabular-nums"
          >
            {(index + 1).toLocaleString(locale)} / {siblings.length.toLocaleString(locale)}
          </Text>
          <Button
            accessibilityLabel={t('chat.branch.next')}
            disabled={!selectBranch || index >= siblings.length - 1}
            icon={<ChevronRightIcon className="size-4 text-muted-foreground" />}
            onPress={() => show(index + 1)}
            size="xs"
            testID="message-answer-next"
            variant="ghost"
          />
        </View>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
