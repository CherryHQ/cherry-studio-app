import { Breadcrumbs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { FileFolder } from '@/shared/data/types/fileLibrary';

import { fileFolderAncestors } from './fileFolderAncestors';

export function FileFolderBreadcrumbs({
  folderId,
  folders,
  onNavigate,
}: {
  folderId: string | null;
  folders: readonly FileFolder[];
  onNavigate: (folderId: string | null) => void;
}) {
  const { t } = useTranslation();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors = fileFolderAncestors(folderId, byId);
  const segments = [{ id: null, name: t('library.title') }, ...ancestors];

  return (
    <Breadcrumbs
      items={segments.map((segment) => ({
        key: segment.id ?? 'root',
        label: segment.name,
        onPress: segment.id === folderId ? undefined : () => onNavigate(segment.id),
      }))}
      testID="file-folder-breadcrumbs"
    />
  );
}
