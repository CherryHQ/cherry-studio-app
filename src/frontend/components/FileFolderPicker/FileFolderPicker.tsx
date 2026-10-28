import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { BottomSheet, Button, ContentState, Section } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useQuery } from '@/frontend/data/hooks';

import { useCreateFileFolder } from './useCreateFileFolder';

/**
 * Browse to a destination, then confirm the level being shown. The first level
 * is the library itself, so it needs no separate option.
 */
export function FileFolderPicker({
  excludedFolderId,
  selectedFolderId,
  isSaving = false,
  status,
  onClose,
  onSelect,
}: {
  excludedFolderId?: string;
  selectedFolderId?: string | null;
  isSaving?: boolean;
  status?: string;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [folderId, setFolderId] = useState<string | null>(null);
  const query = useQuery('/files/folders');
  const { requestCreate, isCreating } = useCreateFileFolder(folderId);
  const folders = query.data ?? [];
  const currentFolder = folders.find((folder) => folder.id === folderId);
  const children = folders.filter(
    (folder) => folder.parentId === folderId && folder.id !== excludedFolderId,
  );
  const isUnavailable = query.isLoading || Boolean(query.error);
  const isCurrentLocation = selectedFolderId !== undefined && folderId === selectedFolderId;

  return (
    <BottomSheet
      backAction={
        folderId && !isSaving
          ? {
              accessibilityLabel: t('navigation.back'),
              onPress: () => setFolderId(currentFolder?.parentId ?? null),
            }
          : undefined
      }
      dismissible={!isSaving}
      footer={
        <View className="gap-3">
          {status ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
              {status}
            </Text>
          ) : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                disabled={isSaving || isCreating || isUnavailable}
                onPress={requestCreate}
                testID="file-folder-picker-create"
                variant="secondary"
              >
                {t('library.folders.create')}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                disabled={isSaving || isCreating || isUnavailable || isCurrentLocation}
                loading={isSaving}
                onPress={() => onSelect(folderId)}
                testID="file-folder-picker-confirm"
              >
                {t(isCurrentLocation ? 'library.alreadyHere' : 'library.moveHere')}
              </Button>
            </View>
          </View>
        </View>
      }
      onClose={onClose}
      open
      size="large"
      testID="file-folder-picker"
      title={currentFolder?.name ?? t('library.root')}
    >
      <LegendList
        key={folderId ?? 'root'}
        contentContainerStyle={{ paddingBottom: 24 }}
        data={query.error ? [] : children}
        estimatedItemSize={64}
        extraData={{ isSaving, selectedFolderId }}
        keyExtractor={(folder) => folder.id}
        ListEmptyComponent={
          <View className="px-6 py-8">
            {query.isLoading ? (
              <ContentState.Loading title={t('library.loading')} />
            ) : query.error ? (
              <ContentState.Error
                title={t('library.loadFailed')}
                primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
              />
            ) : (
              <ContentState.Empty title={t('library.folders.noChildren')} />
            )}
          </View>
        }
        recycleItems
        renderItem={({ item }) => (
          <Section.Item
            accessibilityState={{ selected: selectedFolderId === item.id }}
            density="comfortable"
            disabled={isSaving}
            label={item.name}
            leading={<FolderIcon className="size-6 text-muted-foreground" />}
            onPress={() => setFolderId(item.id)}
            showChevron
            testID={`file-folder-picker-${item.id}`}
            trailing={
              selectedFolderId === item.id ? (
                <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                  {t('library.currentLocation')}
                </Text>
              ) : undefined
            }
          />
        )}
        style={{ flex: 1 }}
      />
    </BottomSheet>
  );
}
