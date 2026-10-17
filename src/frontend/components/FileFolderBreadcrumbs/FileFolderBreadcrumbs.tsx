import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Fragment, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
  const scrollRef = useRef<ScrollView>(null);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors = fileFolderAncestors(folderId, byId);
  const segments = [{ id: null, name: t('library.title') }, ...ancestors];

  return (
    <ScrollView
      horizontal
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}
      testID="file-folder-breadcrumbs"
    >
      <View className="flex-row items-center gap-1">
        {segments.map((segment, index) => (
          <Fragment key={segment.id ?? 'root'}>
            {index > 0 ? <ChevronRightIcon className="size-3 text-muted-foreground" /> : null}
            {segment.id === folderId ? (
              <View className="min-h-10 justify-center px-1">
                <Text className="max-w-48 font-medium text-sm text-foreground" numberOfLines={1}>
                  {segment.name}
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel={segment.name}
                accessibilityRole="button"
                className="min-h-10 justify-center px-1 active:opacity-60"
                hitSlop={4}
                onPress={() => onNavigate(segment.id)}
              >
                <Text className="max-w-48 text-sm text-muted-foreground" numberOfLines={1}>
                  {segment.name}
                </Text>
              </Pressable>
            )}
          </Fragment>
        ))}
      </View>
    </ScrollView>
  );
}
