import { resolveProviderIcon } from '@cherrystudio/ui/icons';

import {
  DEFAULT_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '../brandAvatarStyles';

describe('brand avatar styles', () => {
  it.each(['cherryin', 'aihubmix', 'lmstudio', 'anthropic', 'yi', 'groq', 'aws-bedrock'])(
    'fills both frame shapes with the %s brand background',
    (providerId) => {
      const icon = resolveProviderIcon(providerId)!;
      expect(getBrandAvatarIconDisplayConfig(icon)).toEqual({ scale: 1 });
      expect(getBrandAvatarIconDisplayConfig(icon, 'circle')).toEqual({ scale: 1 });
    },
  );

  it('preserves inset marks and keeps their corners inside a circular frame', () => {
    const icon = resolveProviderIcon('openai')!;
    const rounded = getBrandAvatarIconDisplayConfig(icon);
    const circle = getBrandAvatarIconDisplayConfig(icon, 'circle');
    expect(rounded.scale).toBe(0.8125);
    expect(circle.scale).toBeLessThanOrEqual(Math.SQRT1_2);
    expect(circle.scale).toBeGreaterThan(0.65);
  });

  it.each([
    ['yi', 'zero-one'],
    ['cherryai', 'cherryin'],
  ])('uses the same layout for %s and its resolved %s artwork', (alias, providerId) => {
    for (const shape of ['circle', 'rounded'] as const) {
      expect(getBrandAvatarIconDisplayConfig(resolveProviderIcon(alias)!, shape)).toEqual(
        getBrandAvatarIconDisplayConfig(resolveProviderIcon(providerId)!, shape),
      );
    }
  });

  it.each([
    ['opencode', 46],
    ['mimo', 48],
  ] as const)('removes the extra canvas inset from %s without cropping its mark', (id, bounds) => {
    const icon = resolveProviderIcon(id)!;
    const rounded = getBrandAvatarIconDisplayConfig(icon);
    const circle = getBrandAvatarIconDisplayConfig(icon, 'circle');
    expect((rounded.scale * bounds) / 72).toBeCloseTo(0.8125);
    expect((circle.scale * bounds) / 72).toBeLessThanOrEqual(Math.SQRT1_2);
  });

  it('keeps the desktop SVG canvas at its native scale outside provider lists', () => {
    expect(DEFAULT_BRAND_ICON_SCALE).toBe(1);
  });

  it('matches the desktop generated fallback colors and Unicode-safe initial', () => {
    expect(getBrandAvatarFallback('codex')).toEqual({
      backgroundColor: '#46429b',
      color: '#FFFFFF',
      initial: 'c',
    });
    expect(getBrandAvatarFallback('E')).toEqual({
      backgroundColor: '#438910',
      color: '#000000',
      initial: 'E',
    });
    expect(getBrandAvatarFallback('')).toEqual({
      backgroundColor: '#448898',
      color: '#000000',
      initial: 'P',
    });
  });
});
