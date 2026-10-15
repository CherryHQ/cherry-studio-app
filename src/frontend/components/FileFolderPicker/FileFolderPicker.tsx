import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useQuery } from '@/frontend/data/hooks';

/** Shared library-folder choice for moving items and binding a conversation. */
export function FileFolderPicker({
  title,
  excludedFolderId,
  rootOption,
  onClose,
  onSelect,
}: {
  title: string;
  excludedFolderId?: string;
  rootOption?: string;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
}) {
  const { t } = useTranslation();
  const query = useQuery('/files/folders');
  const byId = new Map((query.data ?? []).map((folder) => [folder.id, folder]));
  const folders = (query.data ?? []).flatMap((folder) => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let current: typeof folder | undefined = folder;
    while (current) {
      if (current.id === excludedFolderId || seen.has(current.id)) return [];
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return [{ id: folder.id, path: parts.join(' / ') }];
  });
  return (
    <BottomSheet
      open
      title={title}
      onClose={onClose}
      closeAction={{ accessibilityLabel: t('common.close') }}
      size="full"
    >
      <LegendList
        data={folders}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyExtractor={(folder) => folder.id}
        renderItem={({ item }) => (
          <Button variant="ghost" onPress={() => onSelect(item.id)} icon={<FolderIcon />}>
            <Text className="flex-1 text-foreground">{item.path}</Text>
          </Button>
        )}
        ListHeaderComponent={
          rootOption ? (
            <Button variant="ghost" onPress={() => onSelect(null)}>
              {rootOption}
            </Button>
          ) : null
        }
        ListEmptyComponent={
          <View className="py-8">
            {query.isLoading ? (
              <ContentState.Loading title={t('library.loading')} />
            ) : query.error ? (
              <ContentState.Error
                title={t('library.loadFailed')}
                primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
              />
            ) : (
              <ContentState.Empty title={t('library.folders.empty')} />
            )}
          </View>
        }
      />
    </BottomSheet>
  );
}
