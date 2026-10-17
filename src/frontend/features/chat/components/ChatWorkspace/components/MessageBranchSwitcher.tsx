import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import SquareIcon from '@cherrystudio/app-icons/icons/square';
import { BackgroundPressExclusion, Button } from '@cherrystudio/ui/components';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';

import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';

/**
 * Steps between the alternatives at a message's branch point: other answers to
 * the same question, or other questions continuing the same answer. Switching
 * shows that alternative's own saved continuation and never calls a model.
 */
export const MessageBranchSwitcher = memo(function MessageBranchSwitcher({
  message,
}: {
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const { selectBranch, stopAnswer } = useAssistantMessageActions();
  const siblings = message.branch?.siblings;
  const index = siblings?.findIndex((sibling) => sibling.id === message.id) ?? -1;
  if (!siblings || index < 0 || !selectBranch) return null;
  const previous = siblings[index - 1];
  const next = siblings[index + 1];
  const canStop = Boolean(stopAnswer) && message.branch?.multiModel && message.status === 'pending';

  return (
    <BackgroundPressExclusion>
      <View className="flex-row items-center" testID={`message-branch-${message.id}`}>
        {canStop ? (
          <Button
            accessibilityLabel={t('chat.branch.stopAnswer')}
            icon={<SquareIcon className="text-muted-foreground" size={12} />}
            onPress={() => stopAnswer?.({ messageId: message.id })}
            size="xs"
            testID="message-branch-stop"
            variant="ghost"
          />
        ) : null}
        <Button
          accessibilityLabel={t('chat.branch.previous')}
          disabled={!previous}
          icon={<ChevronLeftIcon className="text-muted-foreground" size={15} />}
          onPress={() => previous && selectBranch({ messageId: message.id, targetId: previous.id })}
          size="xs"
          testID="message-branch-previous"
          variant="ghost"
        />
        <Text
          accessibilityLabel={t('chat.branch.position', {
            index: index + 1,
            count: siblings.length,
          })}
          className="min-w-8 text-center font-mono text-muted-foreground text-xs"
        >
          {`${index + 1}/${siblings.length}`}
        </Text>
        <Button
          accessibilityLabel={t('chat.branch.next')}
          disabled={!next}
          icon={<ChevronRightIcon className="text-muted-foreground" size={15} />}
          onPress={() => next && selectBranch({ messageId: message.id, targetId: next.id })}
          size="xs"
          testID="message-branch-next"
          variant="ghost"
        />
      </View>
    </BackgroundPressExclusion>
  );
});
