import ImageIcon from '@cherrystudio/app-icons/icons/image';
import { Image, ImageGenerationLoader } from '@cherrystudio/ui/components';
import { View } from 'react-native';

import type { PaintingBoardCoverCell } from '@/frontend/data/paintings/paintingBoardCover';

const cellGap = 2;

type CoverLayout = 'grid' | 'wide';
type Frame = { height: number; left: number; top: number; width: number };

/**
 * A board's newest work as one mosaic. The wide card lays its cells side by
 * side with the newest one leading; a grid card gives the newest a tall column
 * and stacks the next two beside it.
 */
export function PaintingBoardCover({
  active,
  cells,
  height,
  layout,
  width,
}: {
  active: boolean;
  cells: readonly PaintingBoardCoverCell[];
  height: number;
  layout: CoverLayout;
  width: number;
}) {
  const frames = coverFrames(cells.length, layout, width, height);

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
            </View>
          );
        })
      )}
    </View>
  );
}

function coverFrames(count: number, layout: CoverLayout, width: number, height: number): Frame[] {
  if (count <= 1) return [{ height, left: 0, top: 0, width }];
  if (layout === 'wide' || count === 2) {
    // The newest cell is wider so the eye lands on it first.
    const weights = count === 2 ? [1.5, 1] : [1.5, 1, 1];
    const unit = (width - cellGap * (count - 1)) / weights.reduce((sum, weight) => sum + weight);
    let left = 0;
    return weights.map((weight) => {
      const frame = { height, left, top: 0, width: unit * weight };
      left += frame.width + cellGap;
      return frame;
    });
  }
  const leadWidth = (width - cellGap) * 0.6;
  const sideWidth = width - cellGap - leadWidth;
  const sideHeight = (height - cellGap) / 2;
  return [
    { height, left: 0, top: 0, width: leadWidth },
    { height: sideHeight, left: leadWidth + cellGap, top: 0, width: sideWidth },
    { height: sideHeight, left: leadWidth + cellGap, top: sideHeight + cellGap, width: sideWidth },
  ];
}
