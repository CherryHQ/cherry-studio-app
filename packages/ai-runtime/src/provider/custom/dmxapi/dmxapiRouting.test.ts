import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { resolveDmxapiChatFamily, resolveDmxapiChatRoute } from './dmxapiRouting';

describe('resolveDmxapiChatFamily', () => {
  test.each([
    ['claude-opus-4-6', 'anthropic'],
    ['gemini-2.5-pro', 'gemini'],
    ['gemini-2.5-flash-image-preview', 'openai-compat'],
    ['gemini-embedding-001', 'openai-compat'],
    ['gpt-5', 'openai'],
    ['o3', 'openai'],
    ['gpt-image-1', 'openai-compat'],
    ['qwen3.5-plus', 'openai-compat'],
  ] as const)('routes %s to %s', (modelId, family) => {
    expect(resolveDmxapiChatFamily(modelId)).toBe(family);
  });
});

describe('resolveDmxapiChatRoute', () => {
  test.each([
    ['claude-opus-4-6', ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'anthropic'],
    ['gemini-2.5-pro', ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, 'google'],
    ['gpt-5', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'openai'],
    ['qwen3.5-plus', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, 'dmxapi'],
  ] as const)('maps %s to %s using %s options', (modelId, endpointType, providerOptionsKey) => {
    expect(resolveDmxapiChatRoute(modelId)).toEqual({ endpointType, providerOptionsKey });
  });
});
