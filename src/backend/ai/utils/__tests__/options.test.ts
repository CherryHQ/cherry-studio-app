import { applyFastModeToProviderOptions } from '../options';

describe('applyFastModeToProviderOptions', () => {
  it('uses OpenAI priority service tier only for supported provider-model pairs', () => {
    expect(
      applyFastModeToProviderOptions(
        { fastMode: { transport: 'openai-priority' } },
        { supportsFastMode: true },
        { openai: { reasoningEffort: 'high' } },
        true,
      ),
    ).toEqual({ openai: { reasoningEffort: 'high', serviceTier: 'priority' } });
  });

  it('does not change provider options when fast mode is unavailable', () => {
    const providerOptions = { openai: { reasoningEffort: 'high' } };
    expect(
      applyFastModeToProviderOptions(
        { fastMode: { transport: 'openai-priority' } },
        { supportsFastMode: false },
        providerOptions,
        true,
      ),
    ).toBe(providerOptions);
  });
});
