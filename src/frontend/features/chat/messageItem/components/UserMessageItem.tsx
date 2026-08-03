import type { Message } from '@cherrystudio/universal/data/types/message';
import { type MenuAction, MenuView } from '@expo/ui/community/menu';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MessageParts } from '../../messageContent';
import { useUserMessageSlideInStyle } from '../slideIn/hooks/useUserMessageSlideInStyle';
import { useShouldSlideIn } from '../slideIn/MessageSlideInProvider';

type UserMessageItemProps = {
  message: Message;
};

export function UserMessageItem({ message }: UserMessageItemProps) {
  const { t } = useTranslation();
  const shouldSlideIn = useShouldSlideIn(message.id);
  const slideInStyle = useUserMessageSlideInStyle(shouldSlideIn);
  const menuActions = useMemo<MenuAction[]>(
    () => [
      { id: 'copy-message', image: 'doc.on.doc', title: t('common.copy') },
      { id: 'edit-message', image: 'pencil', title: t('common.edit') },
    ],
    [t],
  );

  return (
    <Animated.View className="w-full items-end px-4 py-2" style={slideInStyle}>
      <View className="max-w-[86%]">
        <MenuView actions={menuActions} shouldOpenOnLongPress>
          <View className="gap-2 rounded-xl bg-settings-grouped-surface p-2">
            <MessageParts message={message} renderMode="plainText" />
          </View>
        </MenuView>
      </View>
    </Animated.View>
  );
}
