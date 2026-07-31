import type { ResolvedSlotTextOptions, SlotTextProps } from '../SlotText.types';

const DEFAULT_OPTIONS: ResolvedSlotTextOptions = {
  bounce: 0.6,
  colorFadeDurationMs: 280,
  durationMs: 200,
  exitOffsetMs: 24,
  maxGraphemes: 32,
  skipUnchanged: true,
  staggerMs: 45,
};

const MINIMUM_WIDTH_DURATION_MS = 140;
const NBSP = '\u00A0';
const EXIT_PHASE_DURATION_MULTIPLIER = 0.65;
// Sub-pixel tolerance for treating a slot's horizontal start offset as unmoved.
const POSITION_STABILITY_TOLERANCE = 0.5;

type SegmentData = { segment: string };
type GraphemeSegmenter = { segment: (text: string) => Iterable<SegmentData> };
type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'grapheme' },
) => GraphemeSegmenter;

const Segmenter = (Intl as typeof Intl & { Segmenter?: GraphemeSegmenterConstructor }).Segmenter;
const graphemeSegmenter = Segmenter
  ? new Segmenter(undefined, { granularity: 'grapheme' })
  : undefined;

export type GlyphTiming = {
  durationMs: number;
  startDelayMs: number;
  startingTiltDegrees: number;
};

export type WidthTiming = {
  durationMs: number;
  startDelayMs: number;
};

export type TransitionPhaseTiming = {
  entryPhaseStartMs: number;
  exitPhaseDurationMs: number;
};

export type SlotTransitionTiming = {
  completionMs: number;
  entry: GlyphTiming;
  exitDurationMs: number;
  width: WidthTiming;
};

export type ResolvedSlotTextOptionsResult = {
  isValid: boolean;
  options: ResolvedSlotTextOptions;
};

export function segmentTextIntoGraphemes(text: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(text);
  }

  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

export function getVisibleSegmentText(segment: string): string {
  return segment === ' ' ? NBSP : segment;
}

export function resolveSlotTextOptions(
  props: Pick<
    SlotTextProps,
    | 'bounce'
    | 'colorFadeDurationMs'
    | 'durationMs'
    | 'exitOffsetMs'
    | 'maxGraphemes'
    | 'skipUnchanged'
    | 'staggerMs'
  >,
): ResolvedSlotTextOptionsResult {
  const isValid =
    isFiniteNonNegative(props.durationMs) &&
    isFiniteNonNegative(props.staggerMs) &&
    isFiniteNonNegative(props.exitOffsetMs) &&
    isFiniteNonNegative(props.colorFadeDurationMs) &&
    isFiniteNumber(props.bounce) &&
    isValidMaximum(props.maxGraphemes);

  return {
    isValid,
    options: {
      bounce: clamp(props.bounce ?? DEFAULT_OPTIONS.bounce, 0, 1),
      colorFadeDurationMs: props.colorFadeDurationMs ?? DEFAULT_OPTIONS.colorFadeDurationMs,
      durationMs: props.durationMs ?? DEFAULT_OPTIONS.durationMs,
      exitOffsetMs: props.exitOffsetMs ?? DEFAULT_OPTIONS.exitOffsetMs,
      maxGraphemes: Math.floor(props.maxGraphemes ?? DEFAULT_OPTIONS.maxGraphemes),
      skipUnchanged: props.skipUnchanged ?? DEFAULT_OPTIONS.skipUnchanged,
      staggerMs: props.staggerMs ?? DEFAULT_OPTIONS.staggerMs,
    },
  };
}

export function calculateGlyphTiming(
  segmentIndex: number,
  targetSegmentCount: number,
  isTrailingSlot: boolean,
  options: Pick<ResolvedSlotTextOptions, 'bounce' | 'durationMs' | 'staggerMs'>,
): GlyphTiming {
  const durationVariation = 1 + options.bounce * 0.18 * deterministicVariation(segmentIndex, 0);
  const staggerVariation = 1 + options.bounce * 0.12 * deterministicVariation(segmentIndex, 1);
  const staggerPosition = isTrailingSlot
    ? targetSegmentCount * 0.5 + (segmentIndex - targetSegmentCount) * 0.25
    : segmentIndex;
  const trailingDurationMultiplier = isTrailingSlot ? 0.75 : 1;

  return {
    durationMs: Math.max(
      0,
      Math.round(options.durationMs * trailingDurationMultiplier * durationVariation),
    ),
    startDelayMs: Math.max(0, Math.round(staggerPosition * options.staggerMs * staggerVariation)),
    startingTiltDegrees: roundToTwoDecimals(
      options.bounce * 5 * deterministicVariation(segmentIndex, 2),
    ),
  };
}

export function calculateWidthTiming(
  currentSegment: string,
  targetSegment: string,
  glyphTiming: GlyphTiming,
): WidthTiming {
  if (glyphTiming.durationMs === 0) {
    return { durationMs: 0, startDelayMs: glyphTiming.startDelayMs };
  }

  if (targetSegment === '') {
    return {
      durationMs: scaledWidthDuration(glyphTiming.durationMs, 0.6),
      startDelayMs: glyphTiming.startDelayMs + Math.round(glyphTiming.durationMs * 0.55),
    };
  }

  if (currentSegment === '') {
    return {
      durationMs: scaledWidthDuration(glyphTiming.durationMs, 0.45),
      startDelayMs: glyphTiming.startDelayMs,
    };
  }

  return {
    durationMs: glyphTiming.durationMs,
    startDelayMs: glyphTiming.startDelayMs,
  };
}

export function calculateSlotCompletionMs(
  glyphTiming: GlyphTiming,
  widthTiming: WidthTiming,
  exitOffsetMs: number,
  colorFadeDurationMs: number,
  hasHighlightColor: boolean,
): number {
  const glyphCompletionMs =
    glyphTiming.startDelayMs +
    exitOffsetMs +
    glyphTiming.durationMs +
    (hasHighlightColor ? colorFadeDurationMs : 0);
  const widthCompletionMs = widthTiming.startDelayMs + widthTiming.durationMs;

  return Math.max(glyphCompletionMs, widthCompletionMs);
}

export function calculateAnimatedSlotFlags(
  fromSegments: readonly string[],
  targetSegments: readonly string[],
  options: Pick<ResolvedSlotTextOptions, 'skipUnchanged'>,
  getSegmentWidth: (segment: string) => number,
): boolean[] {
  const slotCount = Math.max(fromSegments.length, targetSegments.length);
  const flags: boolean[] = [];
  let currentOffset = 0;
  let targetOffset = 0;

  for (let index = 0; index < slotCount; index += 1) {
    const currentSegment = fromSegments[index] ?? '';
    const targetSegment = targetSegments[index] ?? '';
    const isPositionStable = Math.abs(currentOffset - targetOffset) <= POSITION_STABILITY_TOLERANCE;
    flags.push(!options.skipUnchanged || currentSegment !== targetSegment || !isPositionStable);
    currentOffset += currentSegment === '' ? 0 : getSegmentWidth(currentSegment);
    targetOffset += targetSegment === '' ? 0 : getSegmentWidth(targetSegment);
  }

  return flags;
}

export function calculateTransitionPhaseTiming(
  fromSegments: readonly string[],
  animatedSlotFlags: readonly boolean[],
  options: Pick<ResolvedSlotTextOptions, 'durationMs' | 'exitOffsetMs'>,
): TransitionPhaseTiming {
  const hasOutgoingSegment = fromSegments.some(
    (currentSegment, index) => currentSegment !== '' && animatedSlotFlags[index],
  );
  if (!hasOutgoingSegment) {
    return { entryPhaseStartMs: 0, exitPhaseDurationMs: 0 };
  }

  const exitPhaseDurationMs = Math.max(
    0,
    Math.round(options.durationMs * EXIT_PHASE_DURATION_MULTIPLIER),
  );

  return {
    entryPhaseStartMs: exitPhaseDurationMs + options.exitOffsetMs,
    exitPhaseDurationMs,
  };
}

export function calculateSlotTransitionTiming(
  segmentIndex: number,
  targetSegmentCount: number,
  currentSegment: string,
  targetSegment: string,
  options: Pick<
    ResolvedSlotTextOptions,
    'bounce' | 'colorFadeDurationMs' | 'durationMs' | 'staggerMs'
  >,
  phaseTiming: TransitionPhaseTiming,
  hasHighlightColor: boolean,
): SlotTransitionTiming {
  const baseEntryTiming = calculateGlyphTiming(
    segmentIndex,
    targetSegmentCount,
    targetSegment === '',
    options,
  );
  const entry = {
    ...baseEntryTiming,
    startDelayMs: phaseTiming.entryPhaseStartMs + baseEntryTiming.startDelayMs,
  };
  const baseWidthTiming = calculateWidthTiming(currentSegment, targetSegment, baseEntryTiming);
  const width = {
    ...baseWidthTiming,
    startDelayMs:
      targetSegment === ''
        ? phaseTiming.entryPhaseStartMs
        : phaseTiming.entryPhaseStartMs + baseWidthTiming.startDelayMs,
  };
  const exitDurationMs = currentSegment ? phaseTiming.exitPhaseDurationMs : 0;
  const entryCompletionMs = targetSegment
    ? entry.startDelayMs + entry.durationMs + (hasHighlightColor ? options.colorFadeDurationMs : 0)
    : 0;

  return {
    completionMs: Math.max(
      exitDurationMs,
      entryCompletionMs,
      width.startDelayMs + width.durationMs,
    ),
    entry,
    exitDurationMs,
    width,
  };
}

export function calculateTransitionCompletionMs(
  fromSegments: readonly string[],
  targetSegments: readonly string[],
  animatedSlotFlags: readonly boolean[],
  options: Pick<
    ResolvedSlotTextOptions,
    'bounce' | 'colorFadeDurationMs' | 'durationMs' | 'exitOffsetMs' | 'staggerMs'
  >,
  hasHighlightColor: boolean,
): number {
  const phaseTiming = calculateTransitionPhaseTiming(fromSegments, animatedSlotFlags, options);
  const slotCount = Math.max(fromSegments.length, targetSegments.length);
  let completionMs = 0;

  for (let index = 0; index < slotCount; index += 1) {
    const currentSegment = fromSegments[index] ?? '';
    const targetSegment = targetSegments[index] ?? '';
    if (!animatedSlotFlags[index]) {
      continue;
    }

    const slotTiming = calculateSlotTransitionTiming(
      index,
      targetSegments.length,
      currentSegment,
      targetSegment,
      options,
      phaseTiming,
      hasHighlightColor && targetSegment !== '',
    );
    completionMs = Math.max(completionMs, slotTiming.completionMs);
  }

  return completionMs;
}

function isFiniteNonNegative(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

function isFiniteNumber(value: number | undefined): boolean {
  return value === undefined || Number.isFinite(value);
}

function isValidMaximum(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function scaledWidthDuration(durationMs: number, multiplier: number): number {
  return Math.max(MINIMUM_WIDTH_DURATION_MS, Math.round(durationMs * multiplier));
}

function deterministicVariation(segmentIndex: number, channel: number): number {
  let seed = Math.imul(segmentIndex + 1, 0x45d9f3b) ^ Math.imul(channel + 1, 0x27d4eb2d);
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 0x45d9f3b);
  seed ^= seed >>> 16;
  const zeroToOne = (seed >>> 0) / 0xffffffff;

  return zeroToOne * 2 - 1;
}

function roundToTwoDecimals(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
