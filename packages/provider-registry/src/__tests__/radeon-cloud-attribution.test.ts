import { describe, expect, it } from 'vitest';

import { readCatalogJson } from '../testing/catalogData';

const { providers } = readCatalogJson<{
  providers: {
    id: string;
    metadata?: { website?: { apiKey?: string; docs?: string; models?: string; official?: string } };
  }[];
}>('providers.json');

function expectTokenFactorySource(urlString: string | undefined) {
  expect(urlString).toBeDefined();

  const url = new URL(urlString!);
  expect(`${url.origin}${url.pathname}`).toBe('https://developer.amd.com.cn/radeon/tokenfactory');
  expect(Object.fromEntries(url.searchParams)).toEqual({ source: 'cherry-studio' });
}

describe('Radeon Cloud source attribution', () => {
  it('attributes generated Token Factory links to Cherry Studio', () => {
    const provider = providers.find(({ id }) => id === 'radeon-cloud');

    expect(provider).toBeDefined();
    expect(provider?.metadata?.website?.official).toBe('https://developer.amd.com.cn/radeon/');
    expect(provider?.metadata?.website?.docs).toBe('https://developer.amd.com.cn/radeon/');
    expectTokenFactorySource(provider?.metadata?.website?.apiKey);
    expectTokenFactorySource(provider?.metadata?.website?.models);
  });
});
