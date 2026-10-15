import { describe, expect, it } from 'vitest';

import { BedrockExtension, extensions } from '../extensions';

describe('BedrockExtension', () => {
  it('is included in the portable extension set', () => {
    expect(extensions).toContain(BedrockExtension);
  });
});
