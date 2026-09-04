import {
  DEFAULT_BRAND_ICON_SCALE,
  PROVIDER_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '../brandAvatarStyles';

describe('brand avatar styles', () => {
  it.each(['cherryin', 'aihubmix', 'lmstudio', 'anthropic', 'yi', 'groq', 'aws-bedrock'])(
    'contains the %s logo in the shared avatar frame',
    (providerId) => {
      expect(getBrandAvatarIconDisplayConfig(providerId)).toEqual({
        borderRadius: 5,
        scale: PROVIDER_BRAND_ICON_SCALE,
      });
    },
  );

  it('uses one normalized provider scale after transparent padding is trimmed', () => {
    expect(getBrandAvatarIconDisplayConfig('openai')).toEqual({
      scale: PROVIDER_BRAND_ICON_SCALE,
    });
    expect(getBrandAvatarIconDisplayConfig('anthropic', 'provider')).toEqual({
      scale: PROVIDER_BRAND_ICON_SCALE,
    });
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
