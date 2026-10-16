import FileIcon from '@cherrystudio/app-icons/icons/file';
import { ActionMenu, Image, type MenuItem } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { TrashItem } from '@/shared/data/api/schemas/trash';

export function TrashEntryRow({
  date,
  isPending,
  item,
  onDelete,
  onRestore,
}: {
  date: string;
  isPending: boolean;
  item: TrashItem;
  onDelete: (item: TrashItem) => void;
  onRestore: (item: TrashItem) => Promise<void>;
}) {
  const { t } = useTranslation();
  const title = item.title;
  const canRestore = !isPending && item.state === 'trashed';
  const items: MenuItem[] = [
    {
      disabled: !canRestore,
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
        accessibilityActions={[
          ...(canRestore
            ? [{ name: 'restore', label: t('trash.restoreNamed', { name: title }) }]
            : []),
          ...(!isPending
            ? [{ name: 'delete', label: t('trash.deleteNamed', { name: title }) }]
            : []),
        ]}
        accessibilityHint={t('trash.deletedAt', { date })}
        accessibilityLabel={title}
        accessibilityRole="button"
        className="min-h-12 flex-row items-center gap-4 active:opacity-60"
        disabled={isPending}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'restore' && canRestore) void onRestore(item);
          if (nativeEvent.actionName === 'delete' && !isPending) onDelete(item);
        }}
        testID={`trash-entry-${item.id}`}
      >
        <TrashThumbnail item={item} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base text-foreground" numberOfLines={2}>
            {title}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {item.state === 'deleting' ? t('trash.deletionPending') : date}
          </Text>
        </View>
      </Pressable>
    </ActionMenu>
  );
}

function TrashThumbnail({ item }: { item: TrashItem }) {
  const file = useBackendModule('file');
  const thumbnail = useQuery({
    enabled: item.state === 'trashed',
    networkMode: 'always',
    queryFn: async () => ({ uri: await file.getTrashThumbnailUri(item.id, item.deletedAt) }),
    queryKey: queryKeys.files.trashThumbnailUri(item.id, item.deletedAt),
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
      <FileIcon className="size-6 text-foreground" />
      {item.state === 'trashed' && thumbnail.data?.uri ? (
        <Image
          accessible={false}
          className="absolute inset-0 size-full"
          contentFit="cover"
          recyclingKey={`${item.id}:${item.deletedAt}`}
          source={thumbnail.data.uri}
        />
      ) : null}
    </View>
  );
}
