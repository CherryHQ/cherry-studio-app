import {
  DEFAULT_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '../brandAvatarStyles';

describe('brand avatar styles', () => {
  it.each(['cherryin', 'aihubmix', 'lmstudio', 'anthropic', 'yi', 'groq', 'aws-bedrock'])(
    'contains the %s logo in the shared avatar frame',
    (providerId) => {
      expect(getBrandAvatarIconDisplayConfig(providerId)).toEqual({
        borderRadius: 5,
        scale: 5 / 7,
      });
    },
  );

  it('keeps trimmed brand assets at their native default scale', () => {
    expect(getBrandAvatarIconDisplayConfig('openai')).toEqual({
      scale: DEFAULT_BRAND_ICON_SCALE,
    });
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
