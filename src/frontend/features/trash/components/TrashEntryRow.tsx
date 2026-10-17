import FileIcon from '@cherrystudio/app-icons/icons/file';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { ActionMenu, Image, type MenuItem } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { TrashItem } from '@/shared/data/api/schemas/trash';

export function TrashEntryRow({
  daysLeft,
  isPending,
  item,
  onDelete,
  onRestore,
}: {
  daysLeft: string;
  isPending: boolean;
  item: TrashItem;
  onDelete: (item: TrashItem) => void;
  onRestore: (item: TrashItem) => Promise<void>;
}) {
  const { t } = useTranslation();
  const title = item.title;
  const items: MenuItem[] = [
    {
      disabled: isPending,
      id: 'restore',
      label: t('trash.restore'),
      onPress: () => void onRestore(item),
    },
    {
      destructive: true,
      disabled: isPending,
      id: 'delete',
      label: t('trash.deletePermanently'),
      onPress: () => onDelete(item),
    },
  ];

  return (
    <ActionMenu items={items}>
      <Pressable
        accessibilityActions={
          isPending
            ? []
            : [
                { name: 'restore', label: t('trash.restoreNamed', { name: title }) },
                { name: 'delete', label: t('trash.deleteNamed', { name: title }) },
              ]
        }
        accessibilityHint={daysLeft}
        accessibilityLabel={title}
        accessibilityRole="button"
        className="min-h-12 flex-row items-center gap-4 active:opacity-60"
        disabled={isPending}
        onAccessibilityAction={({ nativeEvent }) => {
          if (isPending) return;
          if (nativeEvent.actionName === 'restore') void onRestore(item);
          if (nativeEvent.actionName === 'delete') onDelete(item);
        }}
        testID={`trash-entry-${item.kind}-${item.id}`}
      >
        <TrashThumbnail item={item} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base text-foreground" numberOfLines={2}>
            {title}
          </Text>
          <Text className="text-sm text-muted-foreground">{daysLeft}</Text>
        </View>
      </Pressable>
    </ActionMenu>
  );
}

function TrashThumbnail({ item }: { item: TrashItem }) {
  const file = useBackendModule('file');
  const entryId = item.thumbnailEntryId;
  const thumbnail = useQuery({
    enabled: entryId !== null,
    networkMode: 'always',
    queryFn: async () => ({
      uri: entryId ? await file.getTrashThumbnailUri(entryId, item.deletedAt) : undefined,
    }),
    queryKey: queryKeys.files.trashThumbnailUri(entryId ?? item.id, item.deletedAt),
    retry: false,
    staleTime: Infinity,
  });

  return (
    <View
      accessibilityElementsHidden
      className="size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {item.kind === 'folder' ? (
        <FolderIcon className="size-6 text-foreground" />
      ) : (
        <FileIcon className="size-6 text-foreground" />
      )}
      {entryId && thumbnail.data?.uri ? (
        <Image
          accessible={false}
          className="absolute inset-0 size-full"
          contentFit="cover"
          recyclingKey={`${entryId}:${item.deletedAt}`}
          source={thumbnail.data.uri}
        />
      ) : null}
    </View>
  );
}
