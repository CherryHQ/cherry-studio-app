import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Message } from '@/data/types/message';

import { MessageParts } from '../../messageContent';
import { ContextMenu, type ContextMenuAction } from './contextMenu';

type UserMessageItemProps = {
  message: Message;
};

export function UserMessageItem({ message }: UserMessageItemProps) {
  const { t } = useTranslation();
  const menuActions = useMemo<ContextMenuAction[]>(
    () => [
      { id: 'copy-message', image: 'doc.on.doc', title: t('common.copy') },
      { id: 'edit-message', image: 'pencil', title: t('common.edit') },
    ],
    [t],
  );

  return (
    <View className="w-full items-end px-4 py-2">
      <View className="max-w-[86%]">
        <ContextMenu actions={menuActions}>
          <View className="gap-2 rounded-xl bg-settings-grouped-surface p-2">
            <MessageParts message={message} renderMode="plainText" />
          </View>
        </ContextMenu>
      </View>
    </View>
  );
}
