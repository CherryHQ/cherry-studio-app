import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { ActionMenu, Button, ContextMenu, type MenuItem } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { FileFolder } from '@/shared/data/types/fileLibrary';

/** Tapping a folder enters it; its actions live in the same menu as long press. */
export function FileLibraryFolderItem({
  folder,
  menuItems,
  modifiedDate,
  onOpen,
}: {
  folder: FileFolder;
  menuItems: readonly MenuItem[];
  modifiedDate: string;
  onOpen: (folderId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2">
      <View className="min-w-0 flex-1">
        <ContextMenu items={menuItems}>
          <Pressable
            accessibilityLabel={folder.name}
            accessibilityRole="button"
            className="min-h-18 flex-row items-center gap-4 py-3 active:opacity-60"
            onPress={() => onOpen(folder.id)}
            testID={`file-library-folder-${folder.id}`}
          >
            <View className="size-10 items-center justify-center">
              <FolderIcon className="size-7 text-muted-foreground" />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-base text-foreground" ellipsizeMode="middle" numberOfLines={1}>
                {folder.name}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {t('library.modifiedAt', { date: modifiedDate })}
              </Text>
            </View>
          </Pressable>
        </ContextMenu>
      </View>
      <ActionMenu items={menuItems}>
        <Button
          accessibilityLabel={t('library.manage', { name: folder.name })}
          hitSlop={6}
          icon={<EllipsisIcon />}
          size="sm"
          testID={`file-library-manage-${folder.id}`}
          variant="ghost"
        />
      </ActionMenu>
    </View>
  );
}
