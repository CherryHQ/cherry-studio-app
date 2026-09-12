import { describe, expect, it } from 'vitest';

import { BedrockExtension, extensions } from '../extensions';

describe('BedrockExtension toolFactories', () => {
  const fakeProvider = {
    tools: {
      webFetch_20260209: (config: unknown) => ({ config, tool: 'webFetch_20260209' }),
      webSearch_20260209: (config: unknown) => ({ config, tool: 'webSearch_20260209' }),
    },
  };

  it('wires webSearch to the provider web-search tool', () => {
    const factory = BedrockExtension.config.toolFactories?.webSearch;
    expect(factory).toBeDefined();
    expect(factory?.(fakeProvider as never)({ maxUses: 3 } as never)).toEqual({
      tools: { webSearch: { config: { maxUses: 3 }, tool: 'webSearch_20260209' } },
    });
  });

  it('wires urlContext to the provider web-fetch tool', () => {
    const factory = BedrockExtension.config.toolFactories?.urlContext;
    expect(factory).toBeDefined();
    expect(factory?.(fakeProvider as never)({} as never)).toEqual({
      tools: { urlContext: { config: {}, tool: 'webFetch_20260209' } },
    });
  });

  it('is included in the portable extension set', () => {
    expect(extensions).toContain(BedrockExtension);
  });
});
