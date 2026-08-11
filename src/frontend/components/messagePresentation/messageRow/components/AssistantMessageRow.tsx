import { Button, PrismSweep } from '@cherrystudio/ui/components';
import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MessageStatusRow, StatusRowTextFloor } from '../../components/MessageStatusRow';
import { MessageParts } from '../../messageContent';
import type { AssistantMessageActions, MessagePresentationItem } from '../../types';
import { useAssistantSlideInStyle } from '../slideIn/hooks/useAssistantSlideInStyle';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';

type AssistantMessageRowProps = {
  actions?: AssistantMessageActions;
  message: MessagePresentationItem;
};

export function AssistantMessageRow({ actions, message }: AssistantMessageRowProps) {
  const { t } = useTranslation();
  const isPendingEmptyMessage = message.status === 'pending' && !message.data.parts?.length;
  // 行高从第一帧起就要占住（预留空白与钉顶落点都靠它），所以显形只走 opacity。
  const slideInStyle = useAssistantSlideInStyle(message.id);
  const copyText =
    actions && message.status !== 'pending'
      ? copyAssistantMessageText(message.data.parts ?? [])
      : '';
  const isCopied = actions?.copiedMessageId === message.id;

  return (
    <Animated.View className="w-full gap-2 px-4 py-3" style={slideInStyle}>
      {isPendingEmptyMessage ? (
        // 这一行不含文字，所以要自己撑到一行正文的高度——否则只有 20px 的圆点撑高，比接下来
        // 顶替它的思考行/工具行/正文矮 4px，切换那一帧整条消息在锚点正下方跳一下（48→52）。
        <MessageStatusRow>
          <PrismSweep active />
          <StatusRowTextFloor />
        </MessageStatusRow>
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
    </Animated.View>
  );
}
