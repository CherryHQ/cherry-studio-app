import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import {
  ActionMenu,
  Button,
  ContextMenu,
  FileBrowserRow,
  type MenuItem,
} from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { FileFolder } from '@/shared/data/types/fileLibrary';

/** Tapping a folder enters it; its actions live in the same menu as long press. */
export function FileLibraryFolderItem({
  disabled,
  folder,
  menuItems,
  modifiedDate,
  onOpen,
}: {
  disabled?: boolean;
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
          <FileBrowserRow
            accessibilityLabel={folder.name}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            description={t('library.modifiedAt', { date: modifiedDate })}
            name={folder.name}
            onPress={() => onOpen(folder.id)}
            disabled={disabled}
            testID={`file-library-folder-${folder.id}`}
            preview={<FolderIcon className="size-7 text-muted-foreground" />}
          />
        </ContextMenu>
      </View>
      {menuItems.length > 0 ? (
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
      ) : null}
    </View>
  );
}
