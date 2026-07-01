import type { ProviderMetadata } from 'ai';

import type { CherryMessagePart } from '../message';
import { readCherryMeta, withCherryMeta } from '../uiParts';

function reasoningPart(
  providerMetadata?: ProviderMetadata,
): Extract<CherryMessagePart, { type: 'reasoning' }> {
  return {
    type: 'reasoning',
    text: 'thinking...',
    state: 'done',
    ...(providerMetadata && { providerMetadata }),
  };
}

describe('readCherryMeta', () => {
  test('returns undefined when providerMetadata.cherry is missing', () => {
    expect(readCherryMeta(reasoningPart())).toBeUndefined();
  });

  test('parses a valid reasoning cherry meta payload', () => {
    const part = reasoningPart({ cherry: { thinkingMs: 1200, startedAt: 42 } });

    expect(readCherryMeta(part)).toEqual({ thinkingMs: 1200, startedAt: 42 });
  });

  test('returns undefined for a malformed payload instead of throwing', () => {
    const part = reasoningPart({ cherry: { thinkingMs: 'not-a-number' } });

    expect(readCherryMeta(part)).toBeUndefined();
  });
});

describe('withCherryMeta', () => {
  test('writes a patch onto a part with no existing metadata', () => {
    const part = reasoningPart();

    const patched = withCherryMeta(part, { thinkingMs: 500 });

    expect(readCherryMeta(patched)).toEqual({ thinkingMs: 500 });
  });

  test('merges a patch with existing cherry fields instead of replacing them', () => {
    const part = reasoningPart({ cherry: { startedAt: 42 } });

    const patched = withCherryMeta(part, { thinkingMs: 500 });

    expect(readCherryMeta(patched)).toEqual({ startedAt: 42, thinkingMs: 500 });
  });
});
