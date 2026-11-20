jest.mock('react-native-reanimated', () => ({
  Easing: {
    bezier: (...points: number[]) => ({ points, type: 'bezier' }),
    linear: 'linear',
  },
}));

import { ambientMotion, duration, easing, pressMotion, shimmerTextMotion, spring } from '../motion';

describe('motion vocabulary', () => {
  it('keeps the duration ladder monotonically increasing and preserves legacy steps', () => {
    expect(duration.instant).toBeLessThan(duration.fast);
    expect(duration.fast).toBe(200);
    expect(duration.base).toBe(250);
    expect(duration.slow).toBe(350);
    expect(duration.fast).toBeLessThan(duration.base);
    expect(duration.base).toBeLessThan(duration.slow);
  });

  it('defines positive spring physics across all four motion tiers', () => {
    expect(spring.settle).toEqual({ damping: 31.5, mass: 1, stiffness: 248 });

    for (const preset of Object.values(spring)) {
      expect(preset.damping).toBeGreaterThan(0);
      expect(preset.mass).toBeGreaterThan(0);
      expect(preset.stiffness).toBeGreaterThan(0);
    }

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
