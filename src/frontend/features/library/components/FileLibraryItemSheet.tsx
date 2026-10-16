import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import HistoryIcon from '@cherrystudio/app-icons/icons/history';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import {
  ActionMenu,
  BottomSheet,
  Button,
  ContentState,
  Section,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
  const [page, setPage] = useState<'actions' | 'history' | 'move'>('actions');
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
    enabled: !isFolder && page === 'history',
  });
  const [pending, setPending] = useState(false);
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

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

  function trashVersion(entry: FileEntry) {
    alert.confirm({
      title: t('library.trash.title'),
      description: t('library.history.deleteDescription'),
      confirmLabel: t('common.delete'),
      role: 'destructive',
      onConfirm: () =>
        void perform(() => deleteVersion.trigger({ params: { id: entry.id } }), false),
    });
  }

  async function openVersion(entry: FileEntry) {
    if (pending) return;
    setPending(true);
    try {
      const uri = await files.getUri(entry.id);
      if (!uri) throw new Error('Unavailable');
      onClose();
      openFileEntry({ entry, uri });
    } catch {
      toast.show({ label: t('filePreview.unavailable'), variant: 'danger' });
    } finally {
      setPending(false);
    }
  }

  if (page === 'move')
    return (
      <FileFolderPicker
        title={t('library.move')}
        rootOption={t('library.root')}
        excludedFolderId={isFolder ? item.id : undefined}
        selectedFolderId={isFolder ? selection.folder.parentId : selection.file.folderId}
        isSaving={pending}
        onClose={() => setPage('actions')}
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
      backAction={
        page === 'history'
          ? { accessibilityLabel: t('navigation.back'), onPress: () => setPage('actions') }
          : undefined
      }
      closeAction={{ accessibilityLabel: t('common.close') }}
      onClose={onClose}
      open
      size={page === 'history' ? 'large' : 'compact'}
      testID="file-library-item-sheet"
      title={page === 'history' ? t('library.history.title') : item.name}
    >
      {page === 'history' ? (
        <LegendList
          contentContainerStyle={{ paddingBottom: 24 }}
          data={history.data ?? []}
          estimatedItemSize={80}
          extraData={pending}
          keyExtractor={(entry) => entry.id}
          ListHeaderComponent={
            <View className="px-5 pt-2 pb-5">
              <Text className="font-medium text-base text-foreground">{item.name}</Text>
            </View>
          }
          ListEmptyComponent={
            <View className="px-5 py-6">
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
                <ContentState.Empty title={t('library.empty')} />
              )}
            </View>
          }
          recycleItems
          renderItem={({ item: entry, index }) => (
            <View className="flex-row items-center gap-3 px-5">
              <Pressable
                accessibilityRole="button"
                className="min-h-20 min-w-0 flex-1 flex-row items-center gap-4 py-3 active:opacity-60 disabled:opacity-40"
                disabled={pending}
                onPress={() => void openVersion(entry)}
                testID={`file-library-version-${entry.id}`}
              >
                {index === 0 ? (
                  <FileTextIcon className="size-6 text-foreground" />
                ) : (
                  <HistoryIcon className="size-6 text-muted-foreground" />
                )}
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-medium text-base text-foreground">
                    {index === 0 ? t('library.history.current') : t('library.history.version')}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {dateFormatter.format(entry.createdAt)}
                  </Text>
                </View>
              </Pressable>
              {index > 0 ? (
                <ActionMenu
                  items={[
                    {
                      id: 'open',
                      label: t('library.open'),
                      onPress: () => void openVersion(entry),
                    },
                    {
                      destructive: true,
                      id: 'trash',
                      label: t('library.trash.title'),
                      onPress: () => trashVersion(entry),
                    },
                  ]}
                >
                  <Button
                    accessibilityLabel={t('library.manage', {
                      name: dateFormatter.format(entry.createdAt),
                    })}
                    disabled={pending}
                    hitSlop={6}
                    icon={<EllipsisIcon />}
                    size="sm"
                    variant="ghost"
                  />
                </ActionMenu>
              ) : null}
            </View>
          )}
          style={{ flex: 1 }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <Section variant="plain">
            <Section.Item
              disabled={pending}
              label={t('common.rename')}
              leading={<PencilIcon className="size-5 text-muted-foreground" />}
              onPress={rename}
              showChevron={false}
            />
            <Section.Item
              disabled={pending}
              label={t('library.move')}
              leading={<FolderIcon className="size-5 text-muted-foreground" />}
              onPress={() => setPage('move')}
            />
            {!isFolder ? (
              <Section.Item
                disabled={pending}
                label={t('library.history.title')}
                leading={<HistoryIcon className="size-5 text-muted-foreground" />}
                onPress={() => setPage('history')}
                showChevron
                trailing={
                  <Text className="text-sm text-muted-foreground">
                    {new Intl.NumberFormat(i18n.resolvedLanguage).format(
                      history.data?.length ?? selection.file.versionCount,
                    )}
                  </Text>
                }
              />
            ) : null}
            <Section.Item
              destructive
              disabled={pending}
              label={t('library.trash.title')}
              leading={<Trash2Icon className="size-5 text-destructive" />}
              onPress={trash}
              showChevron={false}
            />
          </Section>
        </ScrollView>
      )}
    </BottomSheet>
  );
}
