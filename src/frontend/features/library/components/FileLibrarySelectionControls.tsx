import { useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FileFolderPicker } from '@/frontend/components/FileFolderPicker';
import {
  SelectionControls,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { ErrorCode } from '@/shared/data/api/errors';

import { useMoveLibraryFiles } from '../hooks/useMoveLibraryFiles';
import { fileLibrarySelectionScope } from '../utils/constants';

/** Keep the selected entries frozen while the picker and its batch are active. */
export function FileLibrarySelectionControls({ refresh }: { refresh: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { selectedIds } = useSelectionState();
  const { exitEditing, selectIds } = useSelectionActions();
  const [movingIds, setMovingIds] = useState<readonly string[] | null>(null);
  const { move, progress } = useMoveLibraryFiles();
  const formatter = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);

  async function moveSelected(folderId: string | null) {
    if (!movingIds) return;
    const results = await move(movingIds, folderId);
    if (!results) return;
    const failed = results.filter((result) => result.status === 'failed');
    const moved = results.filter((result) => result.status === 'moved').length;
    if (failed.length > 0) selectIds(failed.map((result) => result.fileEntryId));
    else exitEditing();
    setMovingIds(null);
    toast.show({
      label: t(
        failed.some((result) => result.code === ErrorCode.NOT_FOUND)
          ? 'library.selection.moveResultUnavailable'
          : 'library.selection.moveResult',
        {
          moved: formatter.format(moved),
          unchanged: formatter.format(results.length - moved - failed.length),
          failed: formatter.format(failed.length),
        },
      ),
      variant: failed.length > 0 ? 'danger' : 'success',
    });
    void refresh();
  }

  return (
    <>
      <SelectionControls
        actions={[
          { id: 'move', label: t('library.move'), onPress: () => setMovingIds([...selectedIds]) },
        ]}
        isPending={progress !== null}
        scope={fileLibrarySelectionScope}
      />
      {movingIds ? (
        <FileFolderPicker
          isSaving={progress !== null}
          onClose={() => setMovingIds(null)}
          onSelect={(folderId) => void moveSelected(folderId)}
          status={
            progress
              ? t('library.selection.moveProgress', {
                  completed: formatter.format(progress.completed),
                  total: formatter.format(progress.total),
                })
              : undefined
          }
        />
      ) : null}
    </>
  );
}
