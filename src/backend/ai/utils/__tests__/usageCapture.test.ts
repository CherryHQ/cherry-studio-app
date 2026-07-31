import { createAiUsageCaptureContext, createAiUsagePricingSnapshot } from '../usageCapture';

describe('AI usage capture context', () => {
  it('creates and freezes a same-currency pricing snapshot', () => {
    const pricing = {
      input: { currency: 'USD' as const, perMillionTokens: 1 },
      output: { currency: 'USD' as const, perMillionTokens: 2 },
      cacheRead: { currency: 'USD' as const, perMillionTokens: 0.5 },
      cacheWrite: { currency: 'USD' as const, perMillionTokens: 0.75 },
    };

    const snapshot = createAiUsagePricingSnapshot(pricing, '2026-07-30T00:00:00.000Z');

    expect(snapshot).toEqual({
      currency: 'USD',
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 2,
      cacheReadPerMillionTokens: 0.5,
      cacheWritePerMillionTokens: 0.75,
      capturedAt: '2026-07-30T00:00:00.000Z',
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('rejects mixed-currency pricing instead of producing an invalid cost basis', () => {
    expect(
      createAiUsagePricingSnapshot({
        input: { currency: 'USD', perMillionTokens: 1 },
        output: { currency: 'CNY', perMillionTokens: 2 },
      }),
    ).toBeNull();
  });

  it('deep-clones attribution before the provider call', () => {
    const source = { type: 'assistant' as const, id: 'assistant-1', name: 'Before', icon: 'A' };
    const credentialReceipt = {
      attribution: 'explicit' as const,
      id: 'key-1',
      label: 'Before',
      masked: 'sk-****',
    };
    const context = createAiUsageCaptureContext({
      providerId: 'openrouter',
      providerName: 'OpenRouter',
      modelId: 'openai/gpt-5',
      modelName: 'GPT-5',
      credentialReceipt,
      source,
      messageRef: { kind: 'chat', id: 'message-1' },
    });

    source.name = 'After';
    credentialReceipt.label = 'After';

    expect(context.source?.name).toBe('Before');
    expect(context.credentialReceipt).toMatchObject({ label: 'Before' });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.source)).toBe(true);
    expect(Object.isFrozen(context.credentialReceipt)).toBe(true);
  });
});
