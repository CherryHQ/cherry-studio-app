jest.mock('react-native-reanimated', () => ({
  Easing: {
    bezier: (...points: number[]) => ({ points, type: 'bezier' }),
    linear: 'linear',
  },
}));

import { ambientMotion, duration, easing, pressMotion, shimmerTextMotion, spring } from '../motion';

function dampingRatio({
  damping,
  mass,
  stiffness,
}: {
  damping: number;
  mass: number;
  stiffness: number;
}) {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

describe('motion vocabulary', () => {
  it('keeps the duration ladder monotonically increasing and preserves legacy steps', () => {
    expect(duration.instant).toBeLessThan(duration.fast);
    expect(duration.fast).toBe(200);
    expect(duration.base).toBe(250);
    expect(duration.slow).toBe(350);
    expect(duration.fast).toBeLessThan(duration.base);
    expect(duration.base).toBeLessThan(duration.slow);
  });

  it('defines coherent spring physics and damping ratios across all four motion tiers', () => {
    expect(spring.settle).toEqual({ damping: 31.5, mass: 1, stiffness: 248 });

    for (const preset of Object.values(spring)) {
      expect(preset.damping).toBeGreaterThan(0);
      expect(preset.mass).toBeGreaterThan(0);
      expect(preset.stiffness).toBeGreaterThan(0);
    }

    const tactileZeta = dampingRatio(spring.tactile);
    const morphZeta = dampingRatio(spring.morph);
    const settleZeta = dampingRatio(spring.settle);
    const gentleZeta = dampingRatio(spring.gentle);

    expect(tactileZeta).toBeGreaterThanOrEqual(0.85);
    expect(tactileZeta).toBeLessThanOrEqual(1);
    expect(morphZeta).toBeGreaterThanOrEqual(0.68);
    expect(morphZeta).toBeLessThanOrEqual(0.85);
    expect(morphZeta).toBeLessThan(tactileZeta);
    expect(settleZeta).toBeCloseTo(1, 2);
    expect(gentleZeta).toBeGreaterThanOrEqual(0.9);

    expect(spring.tactile.stiffness).toBeGreaterThan(spring.morph.stiffness);
    expect(spring.morph.stiffness).toBeGreaterThan(spring.settle.stiffness);
    expect(spring.settle.stiffness).toBeGreaterThan(spring.gentle.stiffness);
  });

  it('exposes shared curves and bounded tactile/ambient tokens', () => {
    expect(easing.linear).toBe('linear');
    expect(easing.overshoot).toBeDefined();
    expect(easing.settle).toBeDefined();
    expect(easing.inOut).toBeDefined();
    expect(easing.sheet).toBeDefined();

    expect(pressMotion.scale).toBeGreaterThan(0.9);
    expect(pressMotion.scale).toBeLessThan(pressMotion.subtleScale);
    expect(pressMotion.subtleScale).toBeLessThan(1);
    expect(pressMotion.pressIn.duration).toBeLessThanOrEqual(duration.instant);
    expect(pressMotion.pressOut).toBe(spring.tactile);

    expect(ambientMotion.pulseDuration).toBeGreaterThan(0);
    expect(shimmerTextMotion).toEqual({
      duration: ambientMotion.shimmerDuration,
      easing: easing.linear,
    });
  });
});
