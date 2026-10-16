import { type MenuItem, useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, useMutation } from '@/frontend/data';
import { ErrorCode, isDataApiError } from '@/shared/data/api/errors';
import type { FileFolder, LibraryFile } from '@/shared/data/types/fileLibrary';

export type LibrarySelection =
  | { kind: 'folder'; folder: FileFolder }
  | { kind: 'file'; file: LibraryFile };

/** Row menus run quick actions directly; only moving needs a surface to pick the destination. */
export function useFileLibraryItemActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const files = useBackendModule('file');
  const editFolder = useMutation('PATCH', '/files/folders/:id');
  const editFile = useMutation('PATCH', '/files/library/:id');
  const deleteFolder = useMutation('DELETE', '/files/folders/:id');
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [moving, setMoving] = useState<LibrarySelection | null>(null);
  const closeMove = useCallback(() => setMoving(null), []);

  // One change at a time, reported in place: success and repeatable failures are toasts.
  const perform = useCallback(
    async (action: () => Promise<unknown>) => {
      if (pendingRef.current) return false;
      pendingRef.current = true;
      setIsPending(true);
      try {
        await action();
        toast.show({ label: t('library.changed'), variant: 'success' });
        return true;
      } catch (error) {
        toast.show({
          label: t(
            isDataApiError(error) && error.code === ErrorCode.CONFLICT
              ? 'library.nameConflict'
              : 'library.actionFailed',
          ),
          variant: 'danger',
        });
        return false;
      } finally {
        pendingRef.current = false;
        setIsPending(false);
      }
    },
    [t, toast],
  );

  const rename = useCallback(
    (selection: LibrarySelection) => {
      const item = selection.kind === 'folder' ? selection.folder : selection.file;
      alert.prompt({
        title: t('common.rename'),
        confirmLabel: t('common.save'),
        input: {
          accessibilityLabel: t('common.rename'),
          initialValue: item.name,
          maxLength: 255,
          autoFocus: true,
        },
        onConfirm: (name) => {
          if (!name.trim() || name.trim() === item.name) return;
          void perform(() =>
            selection.kind === 'folder'
              ? editFolder.trigger({ params: { id: item.id }, body: { name } })
              : editFile.trigger({ params: { id: item.id }, body: { name } }),
          );
        },
      });
    },
    [alert, editFile, editFolder, perform, t],
  );

  const trash = useCallback(
    (selection: LibrarySelection) => {
      alert.confirm({
        title: t('library.trash.title'),
        description: t('library.trash.description'),
        confirmLabel: t('common.delete'),
        role: 'destructive',
        onConfirm: () =>
          void perform(() =>
            selection.kind === 'folder'
              ? deleteFolder.trigger({ params: { id: selection.folder.id } })
              : files.moveToTrash(selection.file.entry.id),
          ),
      });
    },
    [alert, deleteFolder, files, perform, t],
  );

  const move = useCallback(
    async (selection: LibrarySelection, folderId: string | null) => {
      const moved = await perform(() =>
        selection.kind === 'folder'
          ? editFolder.trigger({
              params: { id: selection.folder.id },
              body: { parentId: folderId },
            })
          : editFile.trigger({ params: { id: selection.file.id }, body: { folderId } }),
      );
      if (moved) closeMove();
    },
    [closeMove, editFile, editFolder, perform],
  );

  const getMenuItems = useCallback(
    (selection: LibrarySelection): MenuItem[] => [
      {
        disabled: isPending,
        id: 'rename',
        label: t('common.rename'),
        onPress: () => rename(selection),
      },
      {
        disabled: isPending,
        id: 'move',
        label: t('library.move'),
        onPress: () => setMoving(selection),
      },
      {
        destructive: true,
        disabled: isPending,
        id: 'trash',
        label: t('library.trash.title'),
        onPress: () => trash(selection),
      },
    ],
    [isPending, rename, t, trash],
  );

  return { closeMove, getMenuItems, isPending, move, moving };
}
