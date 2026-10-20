import { ContentState, ScrollShadow, Spinner } from '@cherrystudio/ui/components';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  type PaintingBoardCard,
  usePaintingBoardCards,
  usePaintingBoards,
} from '@/frontend/data/paintings/usePaintings';
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
};

/**
 * The gallery: a compact row of templates, then every board — the latest one
 * full width so it is easy to pick up again, the rest two to a row.
 */
export function PaintingBoardList({ bottomInset }: { bottomInset: number }) {
  const { t, i18n } = useTranslation();
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
    () => ({ active: isFocused, columnWidth, dateFormatter, onOpen: openBoard }),
    [columnWidth, dateFormatter, isFocused, openBoard],
  );

  const header = (
    <View className="gap-8 pb-5 pt-2">
      <PaintingTemplateStrip />
      <View className="gap-3">
        <GallerySectionHeader title={t('painting.home.boards')} />
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
    // Boards dissolve into the page under the floating composer instead of peeking around it.
    <ScrollShadow className="flex-1" color={backgroundColor} size={bottomInset} visibility="bottom">
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

  return (
    <Pressable
      accessibilityLabel={`${card.board.title}, ${meta}`}
      accessibilityRole="button"
      className="gap-2 active:opacity-75"
      onPress={() => extraData.onOpen(card.board.id)}
      testID={`painting-board-${card.board.id}`}
    >
      <PaintingBoardCover
        active={extraData.active}
        cells={card.cells}
        height={coverHeight}
        moreCount={card.moreCount}
        width={width}
      />
      <View className="gap-0.5">
        <Text
          className={
            layout === 'wide'
              ? 'font-semibold text-foreground text-lg'
              : 'font-medium text-foreground text-base'
          }
          numberOfLines={1}
        >
          {card.board.title}
        </Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}
