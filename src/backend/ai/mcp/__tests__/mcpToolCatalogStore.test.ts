import { createHash } from 'node:crypto';

import { createMcpConnectionKey, matchesMcpConnectionKey } from '../mcpToolCatalogStore';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, data: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('node:crypto') as typeof import('node:crypto'))
      .createHash('sha256')
      .update(data)
      .digest('hex'),
}));

describe('createMcpConnectionKey', () => {
  test('treats HTTP header name casing and insertion order identically', async () => {
    const titleCaseFirst = await createMcpConnectionKey({
      endpointUrl: 'https://mcp.example.com/sse',
      headers: { Authorization: 'Bearer token-1', 'X-Custom': 'value-1' },
    });
    const lowercaseFirst = await createMcpConnectionKey({
      endpointUrl: 'https://mcp.example.com/sse',
      headers: { authorization: 'Bearer token-1', 'X-Custom': 'value-1' },
    });
    const reordered = await createMcpConnectionKey({
      endpointUrl: 'https://mcp.example.com/sse',
      headers: { 'x-custom': 'value-1', AUTHORIZATION: 'Bearer token-1' },
    });

    expect(lowercaseFirst).toBe(titleCaseFirst);
    expect(reordered).toBe(titleCaseFirst);

    const changedValue = await createMcpConnectionKey({
      endpointUrl: 'https://mcp.example.com/sse',
      headers: { authorization: 'Bearer token-2', 'X-Custom': 'value-1' },
    });
    expect(changedValue).not.toBe(titleCaseFirst);
  });

  test('matchesMcpConnectionKey accepts canonical and legacy v0.6.3 header sort keys while rejecting mismatches', async () => {
    const config = {
      endpointUrl: 'https://mcp.example.com/sse',
      headers: { 'X-Custom': 'value-1', authorization: 'Bearer token-1' },
      oauth: { authorizationId: 'auth-1' },
    };
    const canonicalKey = await createMcpConnectionKey(config);
    // Pre-1.6 (v0.6.3) sorted raw header keys before lowercasing, placing uppercase 'X-Custom'
    // ahead of lowercase 'authorization'.
    const legacyMaterial = JSON.stringify([
      config.endpointUrl,
      config.oauth.authorizationId,
      [
        ['x-custom', 'value-1'],
        ['authorization', 'Bearer token-1'],
      ],
    ]);
    const legacyKey = `remote:${createHash('sha256').update(legacyMaterial).digest('hex')}`;
    expect(legacyKey).not.toBe(canonicalKey);

    await expect(matchesMcpConnectionKey(config, canonicalKey)).resolves.toBe(true);
    await expect(matchesMcpConnectionKey(config, legacyKey)).resolves.toBe(true);
    await expect(
      matchesMcpConnectionKey(
        { ...config, headers: { 'X-Custom': 'value-2', authorization: 'Bearer token-1' } },
        legacyKey,
      ),
    ).resolves.toBe(false);
    await expect(
      matchesMcpConnectionKey(
        { ...config, endpointUrl: 'https://other.example.com/sse' },
        legacyKey,
      ),
    ).resolves.toBe(false);
    await expect(
      matchesMcpConnectionKey({ ...config, oauth: { authorizationId: 'auth-2' } }, legacyKey),
    ).resolves.toBe(false);

    const builtinConfig = {
      origin: 'builtin' as const,
      builtinId: 'gdrive',
      authorizationId: 'auth-1',
      endpointUrl: null,
    };
    await expect(matchesMcpConnectionKey(builtinConfig, 'builtin:gdrive:auth-1')).resolves.toBe(
      true,
    );
    await expect(matchesMcpConnectionKey(builtinConfig, 'builtin:gdrive:auth-2')).resolves.toBe(
      false,
    );
  });
});
