import { BottomSheet, Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { FileFolderPicker } from '@/frontend/components/FileFolderPicker';
import { useBackendModule, useMutation, useQuery } from '@/frontend/data';
import { isDataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { FileEntry } from '@/shared/data/types/file';
import type { FileFolder, LibraryFile } from '@/shared/data/types/fileLibrary';

export type LibrarySelection =
  | { kind: 'folder'; folder: FileFolder }
  | { kind: 'file'; file: LibraryFile };

export function FileLibraryItemSheet({
  selection,
  onClose,
}: {
  selection: LibrarySelection;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const files = useBackendModule('file');
  const { openFileEntry } = useOpenFileEntry();
  const [moving, setMoving] = useState(false);
  const isFolder = selection.kind === 'folder';
  const item = isFolder ? selection.folder : selection.file;
  const editFolder = useMutation('PATCH', '/files/folders/:id');
  const editFile = useMutation('PATCH', '/files/library/:id');
  const deleteFolder = useMutation('DELETE', '/files/folders/:id');
  const deleteVersion = useMutation('DELETE', '/files/versions/:id', {
    refresh: ['/files/history'],
  });
  const history = useQuery('/files/history', {
    query: { id: item.id },
    enabled: !isFolder,
  });
  const [pending, setPending] = useState(false);
  async function perform(action: () => Promise<unknown>, close = true) {
    if (pending) return;
    setPending(true);
    try {
      await action();
      toast.show({ label: t('library.changed'), variant: 'success' });
      if (close) onClose();
    } catch (error) {
      toast.show({
        label: t(
          isDataApiError(error) && error.code === ErrorCode.CONFLICT
            ? 'library.nameConflict'
            : 'library.actionFailed',
        ),
        variant: 'danger',
      });
    } finally {
      setPending(false);
    }
  }
  function rename() {
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
        if (name.trim() && name.trim() !== item.name)
          void perform(() =>
            isFolder
              ? editFolder.trigger({ params: { id: item.id }, body: { name } })
              : editFile.trigger({ params: { id: item.id }, body: { name } }),
          );
      },
    });
  }
  function trash() {
    alert.confirm({
      title: t('library.trash.title'),
      description: t('library.trash.description'),
      confirmLabel: t('common.delete'),
      role: 'destructive',
      onConfirm: () =>
        void perform(() =>
          isFolder
            ? deleteFolder.trigger({ params: { id: item.id } })
            : files.moveToTrash(selection.file.entry.id),
        ),
    });
  }
  async function openVersion(entry: FileEntry) {
    try {
      const uri = await files.getUri(entry.id);
      if (!uri) throw new Error('Unavailable');
      openFileEntry({ entry, uri });
    } catch {
      toast.show({ label: t('filePreview.unavailable'), variant: 'danger' });
    }
  }
  if (moving)
    return (
      <FileFolderPicker
        title={t('library.move')}
        rootOption={t('library.root')}
        excludedFolderId={isFolder ? item.id : undefined}
        onClose={() => setMoving(false)}
        onSelect={(folderId) => {
          void perform(() =>
            isFolder
              ? editFolder.trigger({ params: { id: item.id }, body: { parentId: folderId } })
              : editFile.trigger({ params: { id: item.id }, body: { folderId } }),
          );
        }}
      />
    );
  return (
    <BottomSheet
      open
      title={item.name}
      onClose={onClose}
      closeAction={{ accessibilityLabel: t('common.close') }}
      size="full"
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View className="gap-2">
          <Button variant="ghost" disabled={pending} onPress={rename}>
            {t('common.rename')}
          </Button>
          <Button variant="ghost" disabled={pending} onPress={() => setMoving(true)}>
            {t('library.move')}
          </Button>
          <Button variant="ghost" disabled={pending} onPress={trash}>
            {t('library.trash.title')}
          </Button>
        </View>
        {!isFolder ? (
          <View className="gap-3 pt-6">
            <Text className="font-semibold text-lg text-foreground">
              {t('library.history.title')}
            </Text>
            {history.error ? (
              <ContentState.Error
                title={t('library.loadFailed')}
                primaryAction={{
                  children: t('common.retry'),
                  onPress: () => void history.refetch(),
                }}
              />
            ) : history.isLoading ? (
              <ContentState.Loading title={t('library.loading')} />
            ) : (
              history.data?.map((entry, index) => (
                <View key={entry.id} className="flex-row items-center gap-2 py-2">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-base text-foreground">
                      {index === 0 ? t('library.history.current') : t('library.history.version')}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(entry.createdAt)}
                    </Text>
                  </View>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onPress={() => void openVersion(entry)}
                  >
                    {t('library.open')}
                  </Button>
                  {index > 0 ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onPress={() =>
                        alert.confirm({
                          title: t('library.trash.title'),
                          description: t('library.history.deleteDescription'),
                          confirmLabel: t('common.delete'),
                          role: 'destructive',
                          onConfirm: () =>
                            void perform(
                              () => deleteVersion.trigger({ params: { id: entry.id } }),
                              false,
                            ),
                        })
                      }
                    >
                      {t('common.delete')}
                    </Button>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
