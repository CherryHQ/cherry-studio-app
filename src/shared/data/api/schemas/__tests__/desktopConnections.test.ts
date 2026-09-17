import {
  DesktopPairingQrSchema,
  DesktopProvidersSnapshotSchema,
  parseSupportedAuthConfig,
} from '../desktopConnections';

describe('desktop connection api schemas', () => {
  test('does not let QR payloads inject a local connection ID', () => {
    const qr = DesktopPairingQrSchema.parse({
      code: '0123456789abcdef0123456789abcdef',
      connectionId: '0ad227b7-d202-4e30-a17d-6f6e22fbf1ef',
      ips: ['192.168.1.10'],
      name: 'Cherry Studio PC',
      port: 23333,
      t: 'cherry-studio-pair',
      v: 1,
    });

    expect(qr).not.toHaveProperty('connectionId');
  });

  test('preserves desktop provider and model registry metadata', () => {
    const snapshot = DesktopProvidersSnapshotSchema.parse({
      providers: [
        {
          apiKeys: [{ id: 'key-1', isEnabled: true, key: 'secret' }],
          authConfig: { required: true, type: 'api-key' },
          authMethods: ['api-key'],
          authOptional: false,
          authType: 'api-key',
          defaultChatEndpoint: 'openai-chat-completions',
          id: 'openai-work',
          isEnabled: true,
          models: [
            {
              apiModelId: 'deployment-gpt-5',
              capabilities: [],
              id: 'openai-work::deployment-gpt-5',
              isDeprecated: true,
              isEnabled: false,
              isHidden: true,
              presetModelId: 'gpt-5',
              providerId: 'openai-work',
            },
          ],
          name: 'OpenAI Work',
          presetProviderId: 'openai',
          reportsActualCost: true,
        },
      ],
      version: 1,
    });

    expect(snapshot.providers[0]).toMatchObject({
      authMethods: ['api-key'],
      authOptional: false,
      authType: 'api-key',
      isEnabled: true,
      presetProviderId: 'openai',
      reportsActualCost: true,
    });
    expect(snapshot.providers[0]?.models[0]).toMatchObject({
      isDeprecated: true,
      isEnabled: false,
      isHidden: true,
      modelId: 'deployment-gpt-5',
      presetModelId: 'gpt-5',
    });
  });

  test('retains unsupported OAuth metadata without treating it as mobile auth config', () => {
    const snapshot = DesktopProvidersSnapshotSchema.parse({
      providers: [
        {
          apiKeys: [],
          authConfig: { type: 'oauth' },
          authMethods: ['oauth'],
          authType: 'oauth',
          id: 'openai-codex',
          models: [],
          name: 'OpenAI Codex',
        },
      ],
      version: 1,
    });

    expect(snapshot.providers[0]).toMatchObject({
      authMethods: ['oauth'],
      authType: 'oauth',
    });
    expect(parseSupportedAuthConfig(snapshot.providers[0]?.authConfig)).toBeNull();
  });
  test('drops desktop OAuth secrets while deriving eligibility from authConfig when authType is absent', () => {
    const snapshot = DesktopProvidersSnapshotSchema.parse({
      version: 1,
      providers: [
        {
          id: 'cherryin',
          name: 'CherryIN',
          models: [],
          apiKeys: [{ id: 'model', key: 'model-key', isEnabled: true }],
          authConfig: {
            type: 'oauth',
            accessToken: 'desktop-access',
            refreshToken: 'desktop-refresh',
          },
        },
      ],
    });
    expect(snapshot.providers[0]).toMatchObject({ authType: 'oauth', authConfig: null });
    expect(JSON.stringify(snapshot)).not.toContain('desktop-access');
    expect(JSON.stringify(snapshot)).not.toContain('desktop-refresh');
    expect(snapshot.providers[0]?.apiKeys[0]?.key).toBe('model-key');
  });
});
