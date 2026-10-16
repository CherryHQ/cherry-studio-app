import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { FileFolder } from '@/shared/data/types/fileLibrary';

export function FileLibraryFolderItem({
  folder,
  onOpen,
  onManage,
  modifiedDate,
}: {
  folder: FileFolder;
  modifiedDate: string;
  onOpen: (folderId: string) => void;
  onManage: (folder: FileFolder) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        accessibilityLabel={folder.name}
        accessibilityRole="button"
        className="min-h-18 min-w-0 flex-1 flex-row items-center gap-4 py-3 active:opacity-60"
        onLongPress={() => onManage(folder)}
        onPress={() => onOpen(folder.id)}
        testID={`file-library-folder-${folder.id}`}
      >
        <View className="size-10 items-center justify-center">
          <FolderIcon className="size-7 text-muted-foreground" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base text-foreground" numberOfLines={2}>
            {folder.name}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {t('library.modifiedAt', { date: modifiedDate })}
          </Text>
        </View>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Pressable>
      <Button
        accessibilityLabel={t('library.manage', { name: folder.name })}
        hitSlop={6}
        icon={<EllipsisIcon />}
        onPress={() => onManage(folder)}
        size="sm"
        variant="ghost"
      />
    </View>
  );
}
