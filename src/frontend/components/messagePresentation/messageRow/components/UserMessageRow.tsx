import { Menu, type MenuItem } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
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
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'copy-message',
        label: t('common.copy'),
        onPress: noopMessageAction,
        systemImage: 'doc.on.doc',
      },
      {
        id: 'edit-message',
        label: t('common.edit'),
        onPress: noopMessageAction,
        systemImage: 'pencil',
      },
    ],
    [t],
  );

  return (
    <Animated.View className="w-full items-end px-4 py-2" style={slideInStyle}>
      <View className="max-w-[86%]">
        <Menu items={menuItems} trigger="longPress">
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
        </Menu>
      </View>
    </Animated.View>
  );
}

function noopMessageAction() {}
