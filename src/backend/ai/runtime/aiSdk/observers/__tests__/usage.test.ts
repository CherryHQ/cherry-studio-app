import type { LanguageModelUsage } from 'ai';

import { mergeUsage, toMessageMetadataPatch, ZERO_USAGE } from '../usage';

function usage(overrides: Partial<LanguageModelUsage> = {}): LanguageModelUsage {
  return { ...ZERO_USAGE, ...overrides };
}

describe('mergeUsage', () => {
  it('sums token counts across two steps', () => {
    const a = usage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    const b = usage({ inputTokens: 3, outputTokens: 7, totalTokens: 10 });

    expect(mergeUsage(a, b)).toMatchObject({ inputTokens: 13, outputTokens: 12, totalTokens: 25 });
  });

  it('sums detail counts, staying undefined only when both sides are absent', () => {
    const a: LanguageModelUsage = {
      ...ZERO_USAGE,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: 4 },
    };
    const b: LanguageModelUsage = {
      ...ZERO_USAGE,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: 6 },
    };

    const merged = mergeUsage(a, b);
    expect(merged.outputTokenDetails?.reasoningTokens).toBe(10);
    expect(merged.outputTokenDetails?.textTokens).toBeUndefined();
  });

  it('leaves outputTokenDetails undefined when neither side has one', () => {
    const merged = mergeUsage(ZERO_USAGE, ZERO_USAGE);
    expect(merged.outputTokenDetails).toEqual({
      textTokens: undefined,
      reasoningTokens: undefined,
    });
  });
});

describe('toMessageMetadataPatch', () => {
  it('projects LanguageModelUsage into the CherryUIMessageMetadata token fields', () => {
    const total = usage({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: 20 },
    });

    expect(toMessageMetadataPatch(total)).toEqual({
      totalTokens: 150,
      promptTokens: 100,
      completionTokens: 50,
      thoughtsTokens: 20,
    });
  });
});
