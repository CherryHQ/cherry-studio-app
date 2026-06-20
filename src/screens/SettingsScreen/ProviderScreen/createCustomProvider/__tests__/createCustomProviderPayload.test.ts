const mockRandomUUID = jest.fn();

jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { buildCreateCustomProviderPayload } from '../createCustomProviderPayload';

describe('buildCreateCustomProviderPayload', () => {
  beforeEach(() => {
    mockRandomUUID.mockReset();
  });

  it('builds a create payload with name, endpoint type, UUID, and providerId', () => {
    mockRandomUUID.mockReturnValue('uuid-123');
    const payload = buildCreateCustomProviderPayload({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      name: 'My Custom Provider',
    });

    expect(payload).toMatchObject({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      name: 'My Custom Provider',
    });
    expect(payload.providerId).toBe('uuid-123');
    expect(payload.presetProviderId).toBeUndefined();
  });

  it('trims the provider name', () => {
    mockRandomUUID.mockReturnValue('uuid-456');
    const payload = buildCreateCustomProviderPayload({
      defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      name: '  My Provider  ',
    });

    expect(payload.name).toBe('My Provider');
  });

  it('generates a unique providerId for each call', () => {
    mockRandomUUID.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2');
    const payload1 = buildCreateCustomProviderPayload({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      name: 'P1',
    });
    const payload2 = buildCreateCustomProviderPayload({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      name: 'P2',
    });

    expect(payload1.providerId).toBe('uuid-1');
    expect(payload2.providerId).toBe('uuid-2');
  });

  it('accepts an explicit providerId override', () => {
    const payload = buildCreateCustomProviderPayload({
      defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
      name: 'Ollama',
      providerId: 'my-ollama',
    });

    expect(payload.providerId).toBe('my-ollama');
  });

  it('rejects empty name via Zod validation', () => {
    mockRandomUUID.mockReturnValue('uuid-error');
    expect(() =>
      buildCreateCustomProviderPayload({
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        name: '',
      }),
    ).toThrow();
  });

  it('accepts optional presetProviderId', () => {
    mockRandomUUID.mockReturnValue('uuid-789');
    const payload = buildCreateCustomProviderPayload({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      name: 'Custom',
      presetProviderId: 'openai',
    });

    expect(payload.presetProviderId).toBe('openai');
  });
});
