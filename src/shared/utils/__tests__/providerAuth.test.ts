import { resolveAuthOptional } from '../providerAuth';

describe('resolveAuthOptional', () => {
  test('a stored api-key requirement wins over the preset', () => {
    expect(resolveAuthOptional({ type: 'api-key', required: false }, false)).toBe(true);
    expect(resolveAuthOptional({ type: 'api-key', required: true }, true)).toBe(false);
  });

  test('falls back to the preset without a stored requirement', () => {
    expect(resolveAuthOptional({ type: 'api-key' }, true)).toBe(true);
    expect(resolveAuthOptional({ type: 'api-key-aws', region: 'us-east-1' }, false)).toBe(false);
    expect(resolveAuthOptional(null, undefined)).toBeUndefined();
  });
});
