import {
  clamp01,
  effortGaugeNeedleAngle,
  getEffortSliderTrackGeometry,
  magnetize,
  nearestStopIndex,
  stopFraction,
  trackXToFraction,
} from '../effortSliderMath';
import { effortSliderThumbInset, effortSliderThumbSize } from '../effortSliderVisual';

describe('clamp01', () => {
  it('clamps to the unit interval', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe('stopFraction', () => {
  it('spaces stops evenly across the track', () => {
    expect(stopFraction(0, 5)).toBe(0);
    expect(stopFraction(2, 5)).toBe(0.5);
    expect(stopFraction(4, 5)).toBe(1);
  });

  it('clamps out-of-range indices', () => {
    expect(stopFraction(-1, 5)).toBe(0);
    expect(stopFraction(9, 5)).toBe(1);
  });

  it('collapses degenerate tracks to 0', () => {
    expect(stopFraction(0, 1)).toBe(0);
    expect(stopFraction(0, 0)).toBe(0);
  });
});

describe('getEffortSliderTrackGeometry', () => {
  it('aligns every stop between the circular thumb endpoint centers', () => {
    expect(
      getEffortSliderTrackGeometry(300, 3, effortSliderThumbSize, effortSliderThumbInset),
    ).toEqual({
      thumbCenterStart: 33,
      tickCenters: [33, 150, 267],
      travelDistance: 234,
    });
  });

  it('supports model-driven stop counts and clamps undersized travel', () => {
    expect(
      getEffortSliderTrackGeometry(300, 2, effortSliderThumbSize, effortSliderThumbInset)
        .tickCenters,
    ).toEqual([33, 267]);
    expect(
      getEffortSliderTrackGeometry(20, 1, effortSliderThumbSize, effortSliderThumbInset),
    ).toEqual({
      thumbCenterStart: 33,
      tickCenters: [33],
      travelDistance: 0,
    });
    expect(
      getEffortSliderTrackGeometry(300, 0, effortSliderThumbSize, effortSliderThumbInset)
        .tickCenters,
    ).toEqual([]);
  });
});

describe('effortGaugeNeedleAngle', () => {
  it('maps the first, middle, and last stops across the gauge sweep', () => {
    expect(effortGaugeNeedleAngle(0, 5)).toBeCloseTo(-Math.PI / 3);
    expect(effortGaugeNeedleAngle(2, 5)).toBeCloseTo(0);
    expect(effortGaugeNeedleAngle(4, 5)).toBeCloseTo(Math.PI / 3);
  });

  it('clamps invalid indices and collapses a single stop to the start angle', () => {
    expect(effortGaugeNeedleAngle(-1, 5)).toBeCloseTo(-Math.PI / 3);
    expect(effortGaugeNeedleAngle(9, 5)).toBeCloseTo(Math.PI / 3);
    expect(effortGaugeNeedleAngle(0, 1)).toBeCloseTo(-Math.PI / 3);
  });
});

describe('nearestStopIndex', () => {
  it('rounds to the closest stop', () => {
    expect(nearestStopIndex(0, 5)).toBe(0);
    expect(nearestStopIndex(0.3, 5)).toBe(1);
    expect(nearestStopIndex(0.4, 5)).toBe(2);
    expect(nearestStopIndex(1, 5)).toBe(4);
  });

  it('clamps positions outside the track', () => {
    expect(nearestStopIndex(-0.2, 5)).toBe(0);
    expect(nearestStopIndex(1.7, 5)).toBe(4);
  });
});

describe('trackXToFraction', () => {
  it('maps the visual thumb endpoint centers to zero and one', () => {
    expect(trackXToFraction(30, 300, 30)).toBe(0);
    expect(trackXToFraction(150, 300, 30)).toBe(0.5);
    expect(trackXToFraction(270, 300, 30)).toBe(1);
  });

  it('clamps touches outside the endpoints and undersized tracks', () => {
    expect(trackXToFraction(0, 300, 30)).toBe(0);
    expect(trackXToFraction(300, 300, 30)).toBe(1);
    expect(trackXToFraction(20, 40, 30)).toBe(0);
  });
});

describe('magnetize', () => {
  const stopCount = 6;
  const radius = 0.5;

  it('leaves exact stop positions unchanged', () => {
    expect(magnetize(0.4, stopCount, radius)).toBe(0.4);
  });

  it('pulls positions near a stop toward it', () => {
    const stop = stopFraction(2, stopCount);
    const nearStop = stop + 0.1 / (stopCount - 1);
    const pulled = magnetize(nearStop, stopCount, radius);
    expect(Math.abs(pulled - stop)).toBeLessThan(Math.abs(nearStop - stop));
    expect(pulled).toBeGreaterThan(stop);
  });

  it('is strongest close to the stop and fades toward the radius edge', () => {
    const stop = stopFraction(2, stopCount);
    const closePull = magnetize(stop + 0.05 / (stopCount - 1), stopCount, radius) - stop;
    const farPull = magnetize(stop + 0.45 / (stopCount - 1), stopCount, radius) - stop;
    // Relative attraction: close positions keep a smaller share of their offset.
    expect(closePull / 0.05).toBeLessThan(farPull / 0.45);
  });

  it('does not cross the stop it magnetizes toward', () => {
    const stop = stopFraction(3, stopCount);
    for (const offset of [0.02, 0.1, 0.2, 0.3, 0.45]) {
      const above = magnetize(stop + offset / (stopCount - 1), stopCount, radius);
      const below = magnetize(stop - offset / (stopCount - 1), stopCount, radius);
      expect(above).toBeGreaterThanOrEqual(stop);
      expect(below).toBeLessThanOrEqual(stop);
    }
  });

  it('keeps the midpoint between stops in place', () => {
    // distance 0.5 == radius → outside the magnet's effect
    const midpoint = 0.5 * (stopFraction(1, stopCount) + stopFraction(2, stopCount));
    expect(magnetize(midpoint, stopCount, radius)).toBeCloseTo(midpoint, 10);
  });

  it('clamps and survives degenerate tracks', () => {
    expect(magnetize(1.4, stopCount, radius)).toBe(1);
    expect(magnetize(0.7, 1, radius)).toBe(0);
  });
});
