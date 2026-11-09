import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import {
  ActionMenu,
  Button,
  ContentState,
  ContextMenu,
  ScrollShadow,
  SelectionIndicator,
  Spinner,
} from '@cherrystudio/ui/components';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import {
  orderedSelection,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import {
  type PaintingBoardCard,
  usePaintingBoardCards,
  usePaintingBoards,
} from '@/frontend/data/paintings/usePaintings';
import { useSharePaintingBoards } from '@/frontend/hooks/painting';
import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { GallerySectionHeader } from './GallerySectionHeader';
import { PaintingBoardCover } from './PaintingBoardCover';
import { PaintingTemplateStrip } from './PaintingTemplateStrip';

const pageEdge = 16;
const columnGap = 10;
const wideCoverHeight = 210;
const gridCoverHeight = 196;

type BoardListExtraData = {
  active: boolean;
  columnWidth: number;
  dateFormatter: Intl.DateTimeFormat;
  onOpen: (boardId: string) => void;
  onShare: (boardId: string) => void;
  onSelect: (boardId: string) => void;
  onToggle: (boardId: string) => void;
  isEditing: boolean;
  isSharing: boolean;
  selectedIds: ReadonlySet<string>;
};

/**
 * The gallery: a compact row of templates, then every board — the latest one
 * full width so it is easy to pick up again, the rest two to a row.
 */
export function PaintingBoardList({ bottomInset }: { bottomInset: number }) {
  const { t, i18n } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { isEditing, selectedIds } = useSelectionState();
  const { enterEditing, exitEditing, selectIds, toggleId } = useSelectionActions();
  const { share, isSharing } = useSharePaintingBoards();
  const shareBoard = useCallback(
    (id: string) => {
      void share([id]);
    },
    [share],
  );
  const selectBoard = useCallback(
    (id: string) => {
      enterEditing();
      selectIds([id]);
    },
    [enterEditing, selectIds],
  );
  useFocusedBackPress(exitEditing, isEditing);
  const router = useRouter();
  const isFocused = useIsFocused();
  const { onLayout, width } = useLayoutWidth();
  const backgroundColor = useThemeColor('background');
  const boards = usePaintingBoards();
  const { cards } = usePaintingBoardCards(boards.boards);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }),
    [language],
  );
  const openBoard = useCallback(
    (boardId: string) => router.push({ params: { boardId }, pathname: '/paintings' }),
    [router],
  );
  const contentWidth = Math.max(0, width - pageEdge * 2);
  const columnWidth = Math.max(1, (contentWidth - columnGap) / 2);
  const [latest, ...rest] = cards;
  const extraData = useMemo<BoardListExtraData>(
    () => ({
      active: isFocused,
      columnWidth,
      dateFormatter,
      onOpen: openBoard,
      onShare: shareBoard,
      onSelect: selectBoard,
      onToggle: toggleId,
      isEditing,
      isSharing,
      selectedIds,
    }),
    [
      columnWidth,
      dateFormatter,
      isFocused,
      openBoard,
      shareBoard,
      selectBoard,
      toggleId,
      isEditing,
      isSharing,
      selectedIds,
    ],
  );

  const header = (
    <View className="gap-8 pb-5 pt-2">
      <PaintingTemplateStrip />
      <View className="gap-3">
        <GallerySectionHeader
          title={t('painting.home.boards')}
          action={{
            label: t(isEditing ? 'common.cancel' : 'library.selection.start'),
            onPress: isEditing ? exitEditing : enterEditing,
          }}
        />
        <View className="px-4">
          {latest ? (
            <BoardCard
              card={latest}
              coverHeight={wideCoverHeight}
              extraData={extraData}
              layout="wide"
              width={contentWidth}
            />
          ) : boards.isLoading ? (
            <View className="h-32 justify-center">
              <ContentState.Loading />
            </View>
          ) : boards.error ? (
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: () => void boards.refresh() }}
              title={t('painting.home.loadFailed')}
            />
          ) : (
            <View className="rounded-2xl border border-border px-6 py-8">
              <ContentState.Empty
                description={t('painting.home.emptyDescription')}
                testID="painting-boards-empty"
                title={t('painting.home.empty')}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <>
      {/* Keep gallery content beneath the floating composer. */}
      <ScrollShadow
        className="flex-1"
        color={backgroundColor}
        size={bottomInset}
        visibility="bottom"
      >
        <FlashList
          contentContainerStyle={{
            paddingBottom: bottomInset + 16,
            paddingHorizontal: pageEdge - columnGap / 2,
          }}
          contentInsetAdjustmentBehavior="automatic"
          data={rest}
          extraData={extraData}
          keyExtractor={boardKey}
          ListFooterComponent={
            boards.isLoadingMore ? (
              <View className="h-16 items-center justify-center">
                <Spinner
                  accessibilityLabel={t('painting.home.loadingMore')}
                  accessibilityRole="progressbar"
                />
              </View>
            ) : null
          }
          ListHeaderComponent={header}
          ListHeaderComponentStyle={{ marginHorizontal: -(pageEdge - columnGap / 2) }}
          numColumns={2}
          onEndReached={boards.loadMore}
          onEndReachedThreshold={0.7}
          onLayout={onLayout}
          renderItem={renderBoardItem}
          showsVerticalScrollIndicator={false}
          testID="painting-board-list"
        />
      </ScrollShadow>
      {isEditing ? (
        <View
          className="absolute right-0 bottom-0 left-0 flex-row items-center gap-3 border-border-subtle border-t bg-background px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 12) }}
        >
          <Text className="flex-1 text-muted-foreground text-sm">
            {t('common.selection.count', { count: selectedIds.size })}
          </Text>
          <Button
            disabled={!selectedIds.size || isSharing}
            loading={isSharing}
            onPress={() =>
              void share(
                orderedSelection(
                  selectedIds,
                  cards.map((card) => card.board.id),
                ),
              )
            }
          >
            {t('common.share')}
          </Button>
        </View>
      ) : null}
    </>
  );
}

function boardKey(card: PaintingBoardCard) {
  return card.board.id;
}

function renderBoardItem({ extraData, item }: ListRenderItemInfo<PaintingBoardCard>) {
  const data = extraData as BoardListExtraData;
  return (
    <View className="pb-5" style={{ paddingHorizontal: columnGap / 2 }}>
      <BoardCard
        card={item}
        coverHeight={gridCoverHeight}
        extraData={data}
        layout="grid"
        width={data.columnWidth}
      />
    </View>
  );
}

function BoardCard({
  card,
  coverHeight,
  extraData,
  layout,
  width,
}: {
  card: PaintingBoardCard;
  coverHeight: number;
  extraData: BoardListExtraData;
  layout: 'grid' | 'wide';
  width: number;
}) {
  const { t } = useTranslation();
  const meta = t('painting.home.boardMeta', {
    count: card.paintingCount,
    date: extraData.dateFormatter.format(new Date(card.board.updatedAt)),
  });
  const items = [
    {
      id: 'share',
      label: t('common.share'),
      disabled: extraData.isSharing,
      onPress: () => extraData.onShare(card.board.id),
    },
    {
      id: 'select',
      label: t('library.selection.start'),
      onPress: () => extraData.onSelect(card.board.id),
    },
  ];

  return (
    <ContextMenu items={extraData.isEditing ? [] : items}>
      <Pressable
        accessibilityLabel={`${card.board.title}, ${meta}`}
        accessibilityRole={extraData.isEditing ? 'checkbox' : 'button'}
        accessibilityState={
          extraData.isEditing ? { checked: extraData.selectedIds.has(card.board.id) } : undefined
        }
        className="gap-2 active:opacity-75"
        onPress={() =>
          extraData.isEditing ? extraData.onToggle(card.board.id) : extraData.onOpen(card.board.id)
        }
        testID={`painting-board-${card.board.id}`}
      >
        <View>
          <PaintingBoardCover
            active={extraData.active}
            cells={card.cells}
            height={coverHeight}
            moreCount={card.moreCount}
            width={width}
          />
          {extraData.isEditing ? (
            <View className="absolute top-3 right-3">
              <SelectionIndicator
                selected={extraData.selectedIds.has(card.board.id)}
                variant="overlay"
              />
            </View>
          ) : null}
        </View>
        <View className="gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text
              className={
                layout === 'wide'
                  ? 'min-w-0 flex-1 font-semibold text-foreground text-lg'
                  : 'min-w-0 flex-1 font-medium text-foreground text-base'
              }
              numberOfLines={1}
            >
              {card.board.title}
            </Text>
            {!extraData.isEditing ? (
              <ActionMenu items={items}>
                <Button
                  accessibilityLabel={t('common.more')}
                  icon={<EllipsisIcon size={18} />}
                  size="xs"
                  variant="ghost"
                />
              </ActionMenu>
            ) : null}
          </View>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>
    </ContextMenu>
  );
}
