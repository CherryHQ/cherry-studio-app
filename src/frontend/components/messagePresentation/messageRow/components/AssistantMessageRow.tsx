import { Button, PrismSweep } from '@cherrystudio/ui/components';
import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MessageParts } from '../../messageContent';
import type { AssistantMessageActions, MessagePresentationItem } from '../../types';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';

type AssistantMessageRowProps = {
  actions?: AssistantMessageActions;
  message: MessagePresentationItem;
};

export function AssistantMessageRow({ actions, message }: AssistantMessageRowProps) {
  const { t } = useTranslation();
  const isPendingEmptyMessage = message.status === 'pending' && !message.data.parts?.length;
  const copyText =
    actions && message.status !== 'pending'
      ? copyAssistantMessageText(message.data.parts ?? [])
      : '';
  const isCopied = actions?.copiedMessageId === message.id;

  return (
    <View className="w-full gap-2 px-4 py-3">
      {isPendingEmptyMessage ? (
        // 布局与 ReasoningPart 的「思考中」行保持一致（flex-row + gap-2 + py-0.5），
        // 这样待生成占位切换到流式的思考块时，圆点位置连续、不会横向/纵向跳一下。
        <View className="flex-row items-center gap-2 py-0.5">
          <PrismSweep active />
        </View>
      ) : (
        <MessageParts message={message} />
      )}
      {actions && message.status !== 'pending' ? (
        <View className="flex-row items-center" testID="assistant-message-toolbar">
          {copyText ? (
            <Button
              accessibilityLabel={t(isCopied ? 'chat.messageActions.copied' : 'common.copy')}
              hitSlop={6}
              icon={isCopied ? <CheckIcon strokeWidth={2} /> : <CopyIcon strokeWidth={2} />}
              onPress={() => actions.onCopy({ messageId: message.id, text: copyText })}
              size="sm"
              testID="assistant-message-copy"
              variant="ghost"
            />
          ) : null}
          <Button
            accessibilityLabel={t('chat.messageActions.regenerate')}
            disabled={actions.isRegenerateDisabled}
            hitSlop={6}
            icon={<RefreshCwIcon strokeWidth={2} />}
            onPress={() => actions.onRegenerate(message.id)}
            size="sm"
            testID="assistant-message-regenerate"
            variant="ghost"
          />
        </View>
      ) : null}
    </View>
  );
}
