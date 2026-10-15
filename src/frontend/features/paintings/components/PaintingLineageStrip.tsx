import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Image, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { PaintingBoardNode } from '../hooks/usePaintingBoard';

/**
 * Where the focused image came from and what was made from it. Tapping a cell
 * walks along that edge; holding one previews it in place and releasing
 * returns, which is how two versions are compared.
 */
export function PaintingLineageStrip({
  childNodes,
  current,
  onFocus,
  onPreview,
  parents,
}: {
  childNodes: readonly PaintingBoardNode[];
  current: PaintingBoardNode | undefined;
  onFocus: (nodeId: string) => void;
  onPreview: (nodeId: string | null) => void;
  parents: readonly PaintingBoardNode[];
}) {
  const { t } = useTranslation();
  if (parents.length === 0 && childNodes.length === 0) return null;

  const cell = (node: PaintingBoardNode, role: 'parent' | 'current' | 'child') => (
    <LineageCell
      accessibilityLabel={t(`painting.focus.lineage.${role}`)}
      isCurrent={role === 'current'}
      key={node.id}
      node={node}
      onLongPress={role === 'current' ? undefined : () => onPreview(node.id)}
      onPress={role === 'current' ? undefined : () => onFocus(node.id)}
      onPressOut={role === 'current' ? undefined : () => onPreview(null)}
    />
  );

  return (
    <View className="items-center">
      <View className="max-w-full overflow-hidden rounded-2xl border-[0.5px] border-constant-white/15 bg-constant-black/55">
        <ScrollView
          contentContainerClassName="items-center gap-1.5 p-1.5"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {parents.map((node) => cell(node, 'parent'))}
          {parents.length > 0 ? <Separator /> : null}
          {current ? cell(current, 'current') : null}
          {childNodes.length > 0 ? <Separator /> : null}
          {childNodes.map((node) => cell(node, 'child'))}
        </ScrollView>
      </View>
    </View>
  );
}

function Separator() {
  return <ChevronRightIcon className="size-3.5 text-constant-white/40" />;
}

function LineageCell({
  accessibilityLabel,
  isCurrent,
  node,
  onLongPress,
  onPress,
  onPressOut,
}: {
  accessibilityLabel: string;
  isCurrent: boolean;
  node: PaintingBoardNode;
  onLongPress?: () => void;
  onPress?: () => void;
  onPressOut?: () => void;
}) {
  const constantWhite = useThemeColor('constant-white');
  const thumbnail = node.images[0];
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityState={{ selected: isCurrent }}
      className={
        isCurrent
          ? 'size-9 items-center justify-center overflow-hidden rounded-md border-2 border-constant-white'
          : 'size-9 items-center justify-center overflow-hidden rounded-md bg-constant-white/10 opacity-70 active:opacity-100'
      }
      delayLongPress={250}
      disabled={!onPress}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressOut={onPressOut}
    >
      {thumbnail ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={thumbnail.fileEntryId}
          source={thumbnail.uri}
          style={{ height: '100%', width: '100%' }}
        />
      ) : node.status.kind === 'generating' ? (
        <Spinner color={constantWhite} size="sm" />
      ) : node.status.kind === 'stopped' ? (
        <CircleAlertIcon className="size-4 text-destructive" />
      ) : null}
    </Pressable>
  );
}
