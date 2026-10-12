import { describe, expect, it } from 'vitest';

import { isServerToolModelEligible } from '../server-tool-model-eligibility';

describe('trusted native web tool model eligibility', () => {
  it('matches reviewed wire IDs and dated snapshots', () => {
    expect(isServerToolModelEligible('gpt-4.1-2025-04-14', 'openai', 'web-search')).toBe(true);
    expect(isServerToolModelEligible('gemini-3.1-pro-preview', 'gemini', 'url-context')).toBe(true);
  });
  it('matches a host model by the vendor ID behind its namespace', () => {
    expect(isServerToolModelEligible('anthropic/claude-sonnet-4.5', 'cherryin', 'web-search')).toBe(
      true,
    );
    expect(
      isServerToolModelEligible('google/gemini-3.1-pro-preview', 'new-api', 'url-context'),
    ).toBe(true);
    // A host serves page reading for Claude and Gemini only.
    expect(isServerToolModelEligible('openai/gpt-5', 'cherryin', 'url-context')).toBe(false);
  });
  it('does not infer support for adjacent models, other providers, or other capabilities', () => {
    for (const id of [
      'gpt-4.1-nano',
      'gpt-5-batch',
      'o3-mini',
      'gpt-4o-search-preview',
      'gpt-5-search',
    ]) {
      expect(isServerToolModelEligible(id, 'openai', 'web-search')).toBe(false);
    }
    expect(isServerToolModelEligible('gpt-5', 'moonshot', 'web-search')).toBe(false);
    expect(isServerToolModelEligible('deepseek-v3', 'dashscope', 'web-search')).toBe(false);
    expect(isServerToolModelEligible('gpt-5', 'openai', 'url-context')).toBe(false);
    expect(isServerToolModelEligible('gemini-2.0-flash', 'gemini', 'web-search')).toBe(true);
    expect(isServerToolModelEligible('gemini-2.0-flash', 'gemini', 'url-context')).toBe(false);
  });
});
