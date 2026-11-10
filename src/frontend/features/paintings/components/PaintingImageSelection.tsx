import { Button, SelectionIndicator } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { resolveHeaderContentInset, useFocusedBackPress } from '@/frontend/appShell/navigation';
import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { orderedSelection, toggleSelection } from '@/frontend/components/Selection';
import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';

export function PaintingImageSelection({
  fileIds,
  initialId,
  onClose,
  onShare,
}: {
  fileIds: readonly string[];
  initialId?: string;
  onClose(): void;
  onShare(ids: readonly string[]): void;
}) {
  const { t } = useTranslation();
  const { bottom, left, right } = useSafeAreaInsets();
  const [ids] = useState(() => [...new Set(fileIds)]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initialId && ids.includes(initialId) ? [initialId] : []),
  );
  const { width, onLayout } = useLayoutWidth();
  const topInset = resolveHeaderContentInset(useHeaderHeight());
  const size = Math.max(1, (width - 44) / 2);
  const toggle = useCallback(
    (id: string) => setSelected((current) => toggleSelection(current, id)),
    [],
  );
  useFocusedBackPress(onClose);
  return (
    <View className="absolute inset-0 z-50 bg-background">
      <RouteHeader
        title={t('sharing.selectImages')}
        selection={{ onExit: onClose, selectedCount: selected.size }}
      />
      <View className="flex-1" style={{ marginLeft: left, marginRight: right }} onLayout={onLayout}>
        <FlatList
          data={width > 0 ? ids : []}
          extraData={selected}
          keyExtractor={(id) => id}
          numColumns={2}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          contentContainerStyle={{
            paddingTop: topInset + 12,
            paddingHorizontal: 16,
            paddingBottom: 112,
          }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item, index }) => (
            <SelectableImage
              id={item}
              selected={selected.has(item)}
              size={size}
              onToggle={toggle}
              label={t('sharing.selectImage', { index: index + 1 })}
            />
          )}
        />
      </View>
      <View
        className="absolute right-0 bottom-0 left-0 flex-row items-center gap-3 border-border-subtle border-t bg-background pt-3"
        style={{
          paddingLeft: left + 16,
          paddingRight: right + 16,
          paddingBottom: Math.max(bottom, 12),
        }}
      >
        <Button
          onPress={() => setSelected(selected.size === ids.length ? new Set() : new Set(ids))}
          variant="ghost"
        >
          {t(
            selected.size === ids.length
              ? 'common.selection.deselectAll'
              : 'common.selection.selectAll',
          )}
        </Button>
        <View className="flex-1">
          <Button
            disabled={!selected.size}
            onPress={() => onShare(orderedSelection(selected, ids))}
          >
            {t('common.share')}
          </Button>
        </View>
      </View>
    </View>
  );
}

const SelectableImage = memo(function SelectableImage({
  id,
  selected,
  size,
  onToggle,
  label,
}: {
  id: string;
  selected: boolean;
  size: number;
  onToggle(id: string): void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      className="relative mb-3 overflow-hidden rounded-2xl"
      onPress={() => onToggle(id)}
      style={{ width: size, height: size }}
    >
      <View pointerEvents="none">
        <FileEntryPreview entryId={id} size={size} />
      </View>
      <View className="absolute top-3 right-3">
        <SelectionIndicator selected={selected} variant="overlay" />
      </View>
    </Pressable>
  );
});
