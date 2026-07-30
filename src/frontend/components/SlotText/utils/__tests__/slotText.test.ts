import {
  calculateAnimatedSlotFlags,
  calculateGlyphTiming,
  calculateSlotCompletionMs,
  calculateSlotTransitionTiming,
  calculateTransitionCompletionMs,
  calculateTransitionPhaseTiming,
  calculateWidthTiming,
  getVisibleSegmentText,
  resolveSlotTextOptions,
  segmentTextIntoGraphemes,
} from '../slotText';

const uniformWidth = () => 10;

function widthFromTable(widths: Record<string, number>) {
  return (segment: string) => widths[segment] ?? 10;
}

describe('slotText utilities', () => {
  test.each([
    ['astral emoji', '😀'],
    ['joined emoji', '👨‍👩‍👧'],
    ['combining marks', 'e\u0301'],
  ])('keeps %s in one grapheme slot', (_name, value) => {
    expect(segmentTextIntoGraphemes(value)).toEqual([value]);
  });

  test('preserves spaces inside independently measured slots', () => {
    expect(getVisibleSegmentText(' ')).toBe('\u00A0');
    expect(getVisibleSegmentText('A')).toBe('A');
  });

  test('resolves the public defaults', () => {
    expect(resolveSlotTextOptions({})).toEqual({
      isValid: true,
      options: {
        bounce: 0.6,
        colorFadeDurationMs: 280,
        durationMs: 200,
        exitOffsetMs: 24,
        maxGraphemes: 32,
        skipUnchanged: true,
        staggerMs: 45,
      },
    });
  });

  test('clamps finite bounce values and floors the grapheme limit', () => {
    expect(resolveSlotTextOptions({ bounce: 2, maxGraphemes: 12.8 }).options).toMatchObject({
      bounce: 1,
      maxGraphemes: 12,
    });
    expect(resolveSlotTextOptions({ bounce: -1 }).options.bounce).toBe(0);
  });

  test.each([
    { durationMs: -1 },
    { staggerMs: Number.NaN },
    { exitOffsetMs: Number.POSITIVE_INFINITY },
    { colorFadeDurationMs: -1 },
    { bounce: Number.NaN },
    { maxGraphemes: 0 },
  ])('marks invalid numeric options for static fallback', (props) => {
    expect(resolveSlotTextOptions(props)).toMatchObject({ isValid: false });
  });

  test('calculates deterministic timing without variation when bounce is zero', () => {
    expect(
      calculateGlyphTiming(2, 5, false, {
        bounce: 0,
        durationMs: 300,
        staggerMs: 45,
      }),
    ).toEqual({
      durationMs: 300,
      startDelayMs: 90,
      startingTiltDegrees: 0,
    });
  });

  test('shortens and groups trailing slot timing', () => {
    expect(
      calculateGlyphTiming(4, 2, true, {
        bounce: 0,
        durationMs: 300,
        staggerMs: 40,
      }),
    ).toEqual({
      durationMs: 225,
      startDelayMs: 60,
      startingTiltDegrees: 0,
    });
  });

  test('expands new slots and delays removed-slot collapse', () => {
    const glyphTiming = { durationMs: 300, startDelayMs: 90, startingTiltDegrees: 0 };

    expect(calculateWidthTiming('', 'A', glyphTiming)).toEqual({
      durationMs: 140,
      startDelayMs: 90,
    });
    expect(calculateWidthTiming('A', '', glyphTiming)).toEqual({
      durationMs: 180,
      startDelayMs: 255,
    });
  });

  test('waits for width and optional color animations before settling', () => {
    const glyphTiming = { durationMs: 300, startDelayMs: 90, startingTiltDegrees: 0 };
    const widthTiming = { durationMs: 180, startDelayMs: 255 };

    expect(calculateSlotCompletionMs(glyphTiming, widthTiming, 50, 280, false)).toBe(440);
    expect(calculateSlotCompletionMs(glyphTiming, widthTiming, 50, 280, true)).toBe(720);
  });

  test('skips unchanged slots only while their horizontal offset stays put', () => {
    const options = resolveSlotTextOptions({}).options;

    expect(
      calculateAnimatedSlotFlags(
        segmentTextIntoGraphemes('12:45'),
        segmentTextIntoGraphemes('12:46'),
        options,
        uniformWidth,
      ),
    ).toEqual([false, false, false, false, true]);
    expect(
      calculateAnimatedSlotFlags(
        segmentTextIntoGraphemes('Copy'),
        segmentTextIntoGraphemes('Copied'),
        options,
        widthFromTable({ d: 12, e: 9, i: 4, y: 9 }),
      ),
    ).toEqual([false, false, false, true, true, true]);
  });

  test('rolls coincidentally matching graphemes once earlier widths diverge', () => {
    const options = resolveSlotTextOptions({}).options;
    const flags = calculateAnimatedSlotFlags(
      segmentTextIntoGraphemes('In progress'),
      segmentTextIntoGraphemes('Complete'),
      options,
      widthFromTable({ ' ': 6, C: 16, I: 6, m: 20 }),
    );

    // Index 3 "p" matches by coincidence, but "In " (24) and "Com" (46) shift its slot.
    expect(flags).toEqual(Array.from({ length: 11 }, () => true));
  });

  test('rolls every slot when skipUnchanged is disabled', () => {
    const options = resolveSlotTextOptions({ skipUnchanged: false }).options;

    expect(calculateAnimatedSlotFlags(['A', 'B'], ['A', 'B'], options, uniformWidth)).toEqual([
      true,
      true,
    ]);
  });

  test('settles after the longest changed slot and ignores skipped slots', () => {
    const options = resolveSlotTextOptions({ bounce: 0 }).options;

    expect(
      calculateTransitionCompletionMs(['A', 'B'], ['A', 'C'], [false, true], options, false),
    ).toBe(399);
    expect(calculateTransitionCompletionMs(['A'], ['A'], [false], options, true)).toBe(0);
    expect(calculateTransitionCompletionMs(['A'], ['A'], [true], options, true)).toBe(634);
  });

  test('finishes the outgoing phase before changing widths or entering new glyphs', () => {
    const options = resolveSlotTextOptions({ bounce: 0 }).options;
    const phaseTiming = calculateTransitionPhaseTiming(['A', 'B'], [true, true], options);
    const firstSlot = calculateSlotTransitionTiming(0, 2, 'A', 'C', options, phaseTiming, false);
    const secondSlot = calculateSlotTransitionTiming(1, 2, 'B', 'D', options, phaseTiming, false);

    expect(phaseTiming).toEqual({ entryPhaseStartMs: 154, exitPhaseDurationMs: 130 });
    expect(firstSlot.exitDurationMs).toBe(130);
    expect(secondSlot.exitDurationMs).toBe(130);
    expect(firstSlot.entry.startDelayMs).toBe(154);
    expect(firstSlot.width.startDelayMs).toBe(154);
    expect(secondSlot.entry.startDelayMs).toBe(199);
    expect(secondSlot.width.startDelayMs).toBe(199);
  });

  test('starts entry immediately when a transition only adds slots', () => {
    const options = resolveSlotTextOptions({ bounce: 0 }).options;

    expect(calculateTransitionPhaseTiming(['A'], [false, true], options)).toEqual({
      entryPhaseStartMs: 0,
      exitPhaseDurationMs: 0,
    });
  });
});
