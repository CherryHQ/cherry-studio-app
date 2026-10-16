import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import HistoryIcon from '@cherrystudio/app-icons/icons/history';
import {
  ActionMenu,
  BottomSheet,
  Button,
  ContentState,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { useBackendModule, useMutation, useQuery } from '@/frontend/data';
import type { FileEntry } from '@/shared/data/types/file';
import type { LibraryFile } from '@/shared/data/types/fileLibrary';

import { useLibraryChange } from '../hooks/useFileLibraryItemActions';

export function FileVersionHistorySheet({
  file,
  onClose,
}: {
  file: LibraryFile;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const files = useBackendModule('file');
  const { openFileEntry } = useOpenFileEntry();
  const { isPending, perform } = useLibraryChange();
  const deleteVersion = useMutation('DELETE', '/files/versions/:id', {
    refresh: ['/files/history'],
  });
  const history = useQuery('/files/history', { query: { id: file.id } });
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.resolvedLanguage],
  );

  function trashVersion(entry: FileEntry) {
    alert.confirm({
      title: t('library.trash.title'),
      description: t('library.history.deleteDescription'),
      confirmLabel: t('common.delete'),
      role: 'destructive',
      onConfirm: () => void perform(() => deleteVersion.trigger({ params: { id: entry.id } })),
    });
  }

  async function openVersion(entry: FileEntry) {
    const uri = await files.getUri(entry.id).catch(() => undefined);
    if (!uri) {
      toast.show({ label: t('filePreview.unavailable'), variant: 'danger' });
      return;
    }
    onClose();
    openFileEntry({ entry, uri });
  }

  return (
    <BottomSheet
      onClose={onClose}
      open
      size="large"
      testID="file-library-history-sheet"
      title={t('library.history.title')}
    >
      <LegendList
        contentContainerStyle={{ paddingBottom: 24 }}
        data={history.data ?? []}
        estimatedItemSize={80}
        extraData={isPending}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={
          <View className="px-5 pt-2 pb-5">
            <Text className="font-medium text-base text-foreground">{file.name}</Text>
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
              disabled={isPending}
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
                  disabled={isPending}
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
    </BottomSheet>
  );
}
