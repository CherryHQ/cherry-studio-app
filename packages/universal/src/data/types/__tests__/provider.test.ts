import { normalizeCustomProviderBaseUrl } from '../provider';

describe('provider URL normalization', () => {
  it.each([
    ['https://api.example.com/v1', 'https://api.example.com'],
    ['https://api.example.com/v1/', 'https://api.example.com'],
    [' https://api.example.com/root/v1?region=cn ', 'https://api.example.com/root?region=cn'],
  ])('stores the service root for %s', (input, expected) => {
    expect(normalizeCustomProviderBaseUrl(input)).toBe(expected);
  });

  it.each([
    'https://api.example.com/v1beta',
    'https://api.example.com/v2',
    'https://api.example.com/v1/models',
  ])('preserves non-conventional endpoint paths in %s', (input) => {
    expect(normalizeCustomProviderBaseUrl(input)).toBe(input);
  });
});
