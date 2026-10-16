import CheckIcon from '@cherrystudio/app-icons/icons/check';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { BottomSheet, Button, ContentState, Section } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { FileFolderBreadcrumbs } from '@/frontend/components/FileFolderBreadcrumbs';
import { useQuery } from '@/frontend/data/hooks';

import { useCreateFileFolder } from './useCreateFileFolder';

/** Browse a destination before confirming it; opening a folder never changes the binding. */
export function FileFolderPicker({
  title,
  excludedFolderId,
  selectedFolderId,
  rootOption,
  isSaving = false,
  onClose,
  onSelect,
}: {
  title: string;
  excludedFolderId?: string;
  selectedFolderId?: string | null;
  rootOption?: string;
  isSaving?: boolean;
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

  return (
    <BottomSheet
      backAction={
        folderId
          ? {
              accessibilityLabel: t('navigation.back'),
              onPress: () => setFolderId(currentFolder?.parentId ?? null),
            }
          : undefined
      }
      closeAction={{ accessibilityLabel: t('common.close') }}
      footer={
        currentFolder ? (
          <Button
            disabled={isCreating}
            icon={<CheckIcon />}
            loading={isSaving}
            onPress={() => onSelect(currentFolder.id)}
            testID="file-folder-picker-confirm"
          >
            {t('library.folders.select')}
          </Button>
        ) : undefined
      }
      headerAction={
        <Button
          accessibilityLabel={t('library.folders.create')}
          disabled={isSaving || isCreating || query.isLoading || Boolean(query.error)}
          icon={<PlusIcon />}
          onPress={requestCreate}
          size="sm"
          testID="file-folder-picker-create"
          variant="ghost"
        />
      }
      onClose={onClose}
      open
      size="large"
      testID="file-folder-picker"
      title={title}
    >
      <View className="px-4 pb-2">
        <FileFolderBreadcrumbs folderId={folderId} folders={folders} onNavigate={setFolderId} />
      </View>
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
        ListHeaderComponent={
          folderId === null && rootOption ? (
            <View className="pb-3">
              <Section variant="plain">
                <Section.RadioItem
                  disabled={isSaving}
                  label={rootOption}
                  onPress={() => onSelect(null)}
                  selected={selectedFolderId === null}
                />
              </Section>
            </View>
          ) : null
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
                <CheckIcon className="size-4 text-foreground" />
              ) : undefined
            }
          />
        )}
        style={{ flex: 1 }}
      />
    </BottomSheet>
  );
}
