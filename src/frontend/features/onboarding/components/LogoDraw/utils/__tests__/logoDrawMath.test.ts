import { arcPoint, buildArcSweep, segmentProgress } from '../logoDrawMath';
import { CHECK_CENTERLINE, SWIRL_LEFT_CENTERLINE, SWIRL_RIGHT_CENTERLINE } from '../logoPaths';

describe('arcPoint', () => {
  it('matches the fill-path anchors of the left swirl outer rim', () => {
    // Top of the left swirl: (16.72, 17.11) in the source SVG.
    const top = arcPoint(16.72, 34.16, 17.05, -90);
    expect(top.x).toBeCloseTo(16.72, 2);
    expect(top.y).toBeCloseTo(17.11, 2);

    // Left of the left swirl: (0, 34.16) — rim radius is ~16.7–17.05.
    const left = arcPoint(16.72, 34.16, 17.05, 180);
    expect(left.x).toBeCloseTo(-0.33, 2);
    expect(left.y).toBeCloseTo(34.16, 2);
  });

  it('is y-down: positive angles go below the center', () => {
    const below = arcPoint(0, 0, 10, 90);
    expect(below.x).toBeCloseTo(0);
    expect(below.y).toBeCloseTo(10);
  });
});

describe('buildArcSweep', () => {
  it('splits long sweeps into ≤90° segments with the backward sweep flag', () => {
    const d = buildArcSweep(0, 0, 10, 0, -293);
    const segments = d.match(/A /g);
    expect(segments).toHaveLength(4);
    expect(d).toContain('A 10 10 0 0 0 ');
  });

  it('uses the forward sweep flag when angles increase', () => {
    const d = buildArcSweep(0, 0, 10, 0, 90);
    expect(d).toBe('A 10 10 0 0 1 0 10');
  });

  it('lands exactly on the target angle point', () => {
    const d = buildArcSweep(16.72, 34.16, 11.1, -33.35, -326.65);
    const end = arcPoint(16.72, 34.16, 11.1, -326.65);
    const lastPair = d.trim().split(' ').slice(-2).map(Number);
    expect(lastPair[0]).toBeCloseTo(end.x, 2);
    expect(lastPair[1]).toBeCloseTo(end.y, 2);
  });
});

describe('segmentProgress', () => {
  it('maps the segment linearly onto [0, 1]', () => {
    expect(segmentProgress(0.3, 0.3, 0.8)).toBe(0);
    expect(segmentProgress(0.55, 0.3, 0.8)).toBeCloseTo(0.5);
    expect(segmentProgress(0.8, 0.3, 0.8)).toBe(1);
  });

  it('clamps outside the segment, including spring overshoot past 1', () => {
    expect(segmentProgress(0.1, 0.3, 0.8)).toBe(0);
    expect(segmentProgress(0.95, 0.3, 0.8)).toBe(1);
    expect(segmentProgress(1.06, 0.84, 1)).toBe(1);
  });

  it('treats a degenerate segment as a step', () => {
    expect(segmentProgress(0.49, 0.5, 0.5)).toBe(0);
    expect(segmentProgress(0.5, 0.5, 0.5)).toBe(1);
  });
});

describe('centerlines', () => {
  // Guard the hand-reconstructed geometry: each centerline must start and
  // end at its pen-stroke cap center so the growing mask covers the round
  // caps from the first and last frames.
  const firstMove = (d: string) =>
    d
      .match(/^M ([\d.-]+) ([\d.-]+)/)!
      .slice(1, 3)
      .map(Number);
  const lastLine = (d: string) =>
    d
      .match(/L ([\d.-]+) ([\d.-]+)$/)!
      .slice(1, 3)
      .map(Number);

  it('left swirl runs from the top cap to the bottom cap', () => {
    expect(firstMove(SWIRL_LEFT_CENTERLINE)).toEqual([28.54, 26.38]);
    expect(lastLine(SWIRL_LEFT_CENTERLINE)).toEqual([28.54, 41.92]);
  });

  it('right swirl starts on the lower ring at 231° and ends at the end cap', () => {
    // Start sits on the r=11.1 arc at 231° (no cap lead-in), just below the
    // ring's mouth so the nib never bridges it; see LOWER_RIM_FROM_DEG.
    const start = arcPoint(32.05, 49.68, 11.1, 231);
    const [sx, sy] = firstMove(SWIRL_RIGHT_CENTERLINE);
    expect(sx).toBeCloseTo(start.x, 1);
    expect(sy).toBeCloseTo(start.y, 1);
    expect(lastLine(SWIRL_RIGHT_CENTERLINE)).toEqual([50.81, 41.93]);
  });

  it('check runs left to right across the tick', () => {
    expect(firstMove(CHECK_CENTERLINE)).toEqual([24.87, 7.26]);
    expect(lastLine(CHECK_CENTERLINE)).toEqual([39.72, 3.71]);
  });

  it('contains no NaN coordinates', () => {
    for (const d of [SWIRL_LEFT_CENTERLINE, SWIRL_RIGHT_CENTERLINE, CHECK_CENTERLINE]) {
      expect(d).not.toMatch(/NaN/);
    }
  });
});
