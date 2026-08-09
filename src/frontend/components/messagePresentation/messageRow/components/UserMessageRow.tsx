import { ContextMenu } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MessageParts } from '../../messageContent';
import type { MessagePresentationItem } from '../../types';
import { useUserMessageSlideInStyle } from '../slideIn/hooks/useUserMessageSlideInStyle';
import { useShouldSlideIn } from '../slideIn/MessageSlideInProvider';
import { partitionUserMessageParts } from '../utils/partitionUserMessageParts';
import { UserMessageAttachmentStrip } from './UserMessageAttachmentStrip';

type UserMessageRowProps = {
  message: MessagePresentationItem;
};

export function UserMessageRow({ message }: UserMessageRowProps) {
  const { t } = useTranslation();
  const shouldSlideIn = useShouldSlideIn(message.id);
  const slideInStyle = useUserMessageSlideInStyle(shouldSlideIn);
  const { attachments, bodyMessage } = useMemo(() => partitionUserMessageParts(message), [message]);

  return (
    <Animated.View className="w-full items-end px-4 py-2" style={slideInStyle}>
      <View className="max-w-[86%]">
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            <View className="items-end gap-2">
              {attachments.length > 0 ? (
                <UserMessageAttachmentStrip attachments={attachments} messageId={message.id} />
              ) : null}
              {bodyMessage ? (
                <View className="self-end rounded-xl bg-chat-user p-2">
                  <MessageParts message={bodyMessage} renderMode="plainText" />
                </View>
              ) : null}
            </View>
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Item key="copy-message" onSelect={noopMessageAction}>
              {Platform.OS === 'ios' ? <ContextMenu.ItemIcon ios={{ name: 'doc.on.doc' }} /> : null}
              <ContextMenu.ItemTitle>{t('common.copy')}</ContextMenu.ItemTitle>
            </ContextMenu.Item>
            <ContextMenu.Item key="edit-message" onSelect={noopMessageAction}>
              {Platform.OS === 'ios' ? <ContextMenu.ItemIcon ios={{ name: 'pencil' }} /> : null}
              <ContextMenu.ItemTitle>{t('common.edit')}</ContextMenu.ItemTitle>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Root>
      </View>
    </Animated.View>
  );
}

function noopMessageAction() {}
