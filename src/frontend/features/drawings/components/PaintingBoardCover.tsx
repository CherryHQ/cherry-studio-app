import ImageIcon from '@cherrystudio/app-icons/icons/image';
import { Image, ImageGenerationLoader } from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';

import {
  PAINTING_BOARD_COVER_CELLS,
  type PaintingBoardCoverCell,
} from '@/frontend/data/paintings/paintingBoardCover';

const cellGap = 2;

type Frame = { height: number; left: number; top: number; width: number };

/**
 * A board's newest work as one mosaic split in halves: two cells sit side by
 * side, with three the newest keeps the left half while the next two stack in
 * the right half, and past three the bottom-right cell splits again so its
 * right half can say how many more the board holds.
 */
export function PaintingBoardCover({
  active,
  cells,
  height,
  moreCount,
  width,
}: {
  active: boolean;
  cells: readonly PaintingBoardCoverCell[];
  height: number;
  moreCount: number;
  width: number;
}) {
  const frames = coverFrames(cells.length, width, height);

  return (
    <View
      className="overflow-hidden rounded-2xl border border-border-subtle bg-secondary"
      style={{ height, width }}
    >
      {cells.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ImageIcon className="size-7 text-foreground-tertiary" strokeWidth={1.25} />
        </View>
      ) : (
        cells.map((cell, index) => {
          const frame = frames[index];
          return (
            <View
              className="absolute overflow-hidden"
              key={cell.key}
              style={{ height: frame.height, left: frame.left, top: frame.top, width: frame.width }}
            >
              {cell.kind === 'image' ? (
                <Image
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  recyclingKey={cell.key}
                  source={cell.uri}
                  style={{ height: '100%', width: '100%' }}
                  transition={120}
                />
              ) : (
                <ImageGenerationLoader
                  accessible={false}
                  active={active}
                  height={frame.height}
                  width={frame.width}
                />
              )}
              {index === PAINTING_BOARD_COVER_CELLS - 1 && moreCount > 0 ? (
                <View className="absolute inset-0 items-center justify-center bg-constant-black/50">
                  <Text className="font-semibold text-base text-constant-white">+{moreCount}</Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function coverFrames(count: number, width: number, height: number): Frame[] {
  if (count <= 1) return [{ height, left: 0, top: 0, width }];
  const halfWidth = (width - cellGap) / 2;
  const right = halfWidth + cellGap;
  const left = { height, left: 0, top: 0, width: halfWidth };
  if (count === 2) return [left, { height, left: right, top: 0, width: halfWidth }];
  const halfHeight = (height - cellGap) / 2;
  const bottom = halfHeight + cellGap;
  const topRight = { height: halfHeight, left: right, top: 0, width: halfWidth };
  if (count === 3) {
    return [left, topRight, { height: halfHeight, left: right, top: bottom, width: halfWidth }];
  }
  const quarterWidth = (halfWidth - cellGap) / 2;
  return [
    left,
    topRight,
    { height: halfHeight, left: right, top: bottom, width: quarterWidth },
    { height: halfHeight, left: right + quarterWidth + cellGap, top: bottom, width: quarterWidth },
  ];
}
