import {
  DEFAULT_PROVIDER_ICON_SCALE,
  getProviderAvatarFallback,
  getProviderListIconDisplayConfig,
} from '../providerAvatarStyles';

describe('provider avatar styles', () => {
  it.each(['cherryin', 'aihubmix', 'lmstudio', 'anthropic', 'yi', 'groq', 'aws-bedrock'])(
    'contains the %s logo in the provider list frame',
    (providerId) => {
      expect(getProviderListIconDisplayConfig(providerId)).toEqual({
        borderRadius: 5,
        scale: 5 / 7,
      });
    },
  );

  it('keeps trimmed provider assets at their native default scale', () => {
    expect(getProviderListIconDisplayConfig('openai')).toEqual({
      scale: DEFAULT_PROVIDER_ICON_SCALE,
    });
  });

  it('matches the desktop generated fallback colors and Unicode-safe initial', () => {
    expect(getProviderAvatarFallback('codex')).toEqual({
      backgroundColor: '#46429b',
      color: '#FFFFFF',
      initial: 'c',
    });
    expect(getProviderAvatarFallback('E')).toEqual({
      backgroundColor: '#438910',
      color: '#000000',
      initial: 'E',
    });
    expect(getProviderAvatarFallback('')).toEqual({
      backgroundColor: '#448898',
      color: '#000000',
      initial: 'P',
    });
  });
});
