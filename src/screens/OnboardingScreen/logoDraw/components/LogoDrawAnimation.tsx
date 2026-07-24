import { Canvas, Group, Mask, Path } from '@shopify/react-native-skia';
import { type Ref, useCallback, useImperativeHandle, useState } from 'react';
import {
  Extrapolation,
  interpolate,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { useLogoDrawProgress } from '../hooks/useLogoDrawProgress';
import {
  CHECK_MASK_STROKE_WIDTH,
  CHECK_OVERSHOOT_RANGE,
  CHECK_OVERSHOOT_SCALE,
  LOGO_ASPECT_RATIO,
  LOGO_DRAW_SEGMENTS,
  LOGO_VIEWBOX_HEIGHT,
  LOGO_VIEWBOX_INSET,
  SWIRL_MASK_STROKE_WIDTH,
} from '../utils/constants';
import { segmentProgress } from '../utils/logoDrawMath';
import { logoBrandColors } from '../utils/logoPalette';
import {
  CHECK_CENTERLINE,
  CHECK_FILL,
  CHECK_PIVOT,
  SWIRL_LEFT_CENTERLINE,
  SWIRL_LEFT_FILL,
  SWIRL_RIGHT_CENTERLINE,
  SWIRL_RIGHT_FILL,
} from '../utils/logoPaths';

export type LogoDrawAnimationRef = {
  /** (Re)start the draw animation from the beginning. */
  play: () => void;
  /** Alias of play; reads better at call sites restarting a finished run. */
  replay: () => void;
};

export type LogoDrawAnimationProps = {
  /** Rendered logo height in dp; width follows the logo aspect ratio. */
  size: number;
  /** Play the draw animation on mount. Ignored when `progress` is supplied. */
  autoPlay?: boolean;
  /**
   * External progress (0→1) for scrubbing or pager-driven reveals. Supplying
   * it disables the internal timeline and the at-rest unmasked fast path.
   */
  progress?: SharedValue<number>;
  /** Called on the JS thread once the draw reaches the end. */
  onFinish?: () => void;
  /** Imperative play/replay handle. */
  ref?: Ref<LogoDrawAnimationRef>;
};

/**
 * Paint-on reveal of the brand logo: the two orange swirls draw first as one
 * continuous gesture (their pen caps interlock), then the green check lands
 * with a spring. Each fill path is revealed through an alpha mask whose
 * content is a thick round-cap stroke growing along the reconstructed pen
 * centerline (`utils/logoPaths.ts`); all per-frame work stays on the UI
 * thread via Skia's Reanimated integration.
 */
export function LogoDrawAnimation({
  size,
  autoPlay = true,
  progress,
  onFinish,
  ref,
}: LogoDrawAnimationProps) {
  const internalProgress = useSharedValue(0);
  const controlled = progress !== undefined;
  const master = progress ?? internalProgress;
  const [finished, setFinished] = useState(false);

  const handleSettle = useCallback(() => {
    // Controlled progress can scrub back below 1, so the unmasked fast path
    // only engages for the internal timeline.
    if (!controlled) {
      setFinished(true);
    }
    onFinish?.();
  }, [controlled, onFinish]);

  const play = useLogoDrawProgress({
    progress: master,
    controlled,
    autoPlay,
    onSettle: handleSettle,
  });

  const replay = useCallback(() => {
    setFinished(false);
    play();
  }, [play]);

  useImperativeHandle(ref, () => ({ play: replay, replay }), [replay]);

  const leftTrim = useDerivedValue(
    () =>
      segmentProgress(
        master.value,
        LOGO_DRAW_SEGMENTS.swirlLeft.from,
        LOGO_DRAW_SEGMENTS.swirlLeft.to,
      ),
    [master],
  );
  const rightTrim = useDerivedValue(
    () =>
      segmentProgress(
        master.value,
        LOGO_DRAW_SEGMENTS.swirlRight.from,
        LOGO_DRAW_SEGMENTS.swirlRight.to,
      ),
    [master],
  );
  const checkTrim = useDerivedValue(
    () => segmentProgress(master.value, LOGO_DRAW_SEGMENTS.check.from, LOGO_DRAW_SEGMENTS.check.to),
    [master],
  );
  // The landing spring overshoots past 1; the check group converts that tail
  // into a small scale rebound around the tick's center.
  const checkTransform = useDerivedValue(() => {
    const scale = interpolate(
      master.value,
      [1, 1 + CHECK_OVERSHOOT_RANGE],
      [1, CHECK_OVERSHOOT_SCALE],
      Extrapolation.CLAMP,
    );
    return [
      { translateX: CHECK_PIVOT.x },
      { translateY: CHECK_PIVOT.y },
      { scale },
      { translateX: -CHECK_PIVOT.x },
      { translateY: -CHECK_PIVOT.y },
    ];
  }, [master]);

  const height = size;
  const width = size * LOGO_ASPECT_RATIO;
  const fitTransform = [
    { scale: height / LOGO_VIEWBOX_HEIGHT },
    { translateX: LOGO_VIEWBOX_INSET },
    { translateY: LOGO_VIEWBOX_INSET },
  ];

  return (
    <Canvas pointerEvents="none" style={{ height, width }}>
      <Group transform={fitTransform}>
        {finished ? (
          <>
            <Path color={logoBrandColors.swirl} path={SWIRL_LEFT_FILL} />
            <Path color={logoBrandColors.swirl} path={SWIRL_RIGHT_FILL} />
            <Path color={logoBrandColors.check} path={CHECK_FILL} />
          </>
        ) : (
          <>
            <Mask
              mask={
                <Path
                  color="white"
                  end={leftTrim}
                  path={SWIRL_LEFT_CENTERLINE}
                  strokeCap="round"
                  strokeJoin="round"
                  strokeWidth={SWIRL_MASK_STROKE_WIDTH}
                  style="stroke"
                />
              }
              mode="alpha"
            >
              <Path color={logoBrandColors.swirl} path={SWIRL_LEFT_FILL} />
            </Mask>
            <Mask
              mask={
                <Path
                  color="white"
                  end={rightTrim}
                  path={SWIRL_RIGHT_CENTERLINE}
                  strokeCap="round"
                  strokeJoin="round"
                  strokeWidth={SWIRL_MASK_STROKE_WIDTH}
                  style="stroke"
                />
              }
              mode="alpha"
            >
              <Path color={logoBrandColors.swirl} path={SWIRL_RIGHT_FILL} />
            </Mask>
            <Group transform={checkTransform}>
              <Mask
                mask={
                  <Path
                    color="white"
                    end={checkTrim}
                    path={CHECK_CENTERLINE}
                    strokeCap="round"
                    strokeJoin="round"
                    strokeWidth={CHECK_MASK_STROKE_WIDTH}
                    style="stroke"
                  />
                }
                mode="alpha"
              >
                <Path color={logoBrandColors.check} path={CHECK_FILL} />
              </Mask>
            </Group>
          </>
        )}
      </Group>
    </Canvas>
  );
}
