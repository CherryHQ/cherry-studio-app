import { describe, expect, test } from 'vitest';

import { ENDPOINT_TYPE } from '../../schemas/enums';
import {
  formatApiHost,
  formatOllamaApiHost,
  getBaseUrl,
  getProviderBaseUrlIssue,
  isWithTrailingSharp,
  routeToEndpoint,
  shouldAppendProviderApiVersion,
  withoutTrailingApiVersion,
} from '../provider-connection';

describe('provider base URLs', () => {
  test.each([
    ['https://proxy.example.com/gateway#', 'https://proxy.example.com/gateway'],
    ['https://proxy.example.com/gateway/#', 'https://proxy.example.com/gateway'],
    ['https://proxy.example.com/my-responses#', 'https://proxy.example.com/my-responses'],
    ['https://proxy.example.com/v1', 'https://proxy.example.com/v1'],
    ['https://proxy.example.com', 'https://proxy.example.com/v1'],
  ])('formats %s without sending a version marker to the server', (input, expected) => {
    expect(formatApiHost(input)).toBe(expected);
  });

  test('retains full endpoint overrides for the existing AI SDK routing contract', () => {
    expect(
      routeToEndpoint(formatApiHost('https://proxy.example.com/custom/chat/completions#')),
    ).toEqual({
      baseURL: 'https://proxy.example.com/custom',
      endpoint: 'chat/completions',
    });
  });

  test.each([
    ['https://proxy.example.com/v1/chat/completions', 'https://proxy.example.com/v1'],
    ['https://proxy.example.com/gateway/responses', 'https://proxy.example.com/gateway#'],
    ['https://proxy.example.com/gateway/chat/completions#', 'https://proxy.example.com/gateway#'],
  ])(
    'offers a base URL that preserves the pasted request path for %s',
    (input, suggestedBaseUrl) => {
      expect(getProviderBaseUrlIssue(input)).toEqual({ code: 'endpoint-path', suggestedBaseUrl });
    },
  );

  test.each([
    'https://proxy.example.com?api-version=v1',
    'https://proxy.example.com#fragment',
    'https://name:secret@proxy.example.com',
    'file:///private',
  ])('rejects URL components that would absorb or hide the request path: %s', (input) => {
    expect(getProviderBaseUrlIssue(input)).toEqual({ code: 'invalid-url' });
  });

  test('accepts the desktop no-version base URL syntax', () => {
    expect(getProviderBaseUrlIssue('https://proxy.example.com/gateway#')).toBeNull();
  });
});

test('resolves preferred, default, fallback, and non-chat endpoint URLs in order', () => {
  const chat = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
  const messages = ENDPOINT_TYPE.ANTHROPIC_MESSAGES;
  const images = ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION;
  const endpointConfigs = {
    [chat]: { baseUrl: 'https://chat.example.com' },
    [messages]: { baseUrl: 'https://messages.example.com' },
  };
  expect(getBaseUrl({ endpointConfigs, defaultChatEndpoint: chat }, messages)).toBe(
    'https://messages.example.com',
  );
  expect(getBaseUrl({ endpointConfigs, defaultChatEndpoint: messages })).toBe(
    'https://messages.example.com',
  );
  expect(getBaseUrl({ endpointConfigs })).toBe('https://chat.example.com');
  expect(
    getBaseUrl({ endpointConfigs: { [images]: { baseUrl: 'https://images.example.com' } } }),
  ).toBe('https://images.example.com');
  expect(getBaseUrl({ endpointConfigs: null })).toBe('');
});

test('keeps version insertion aligned with copied presets and custom paths', () => {
  expect(shouldAppendProviderApiVersion({ id: 'custom', presetProviderId: 'azure-openai' })).toBe(
    false,
  );
  expect(shouldAppendProviderApiVersion({ id: 'github' })).toBe(false);
  expect(shouldAppendProviderApiVersion({ id: 'custom' })).toBe(true);
  expect(formatApiHost('https://api.example.com/v1beta/models')).toBe(
    'https://api.example.com/v1beta/models',
  );
  expect(formatApiHost('https://api.example.com', false)).toBe('https://api.example.com');
  expect(withoutTrailingApiVersion(' https://api.example.com/v1beta/ ')).toBe(
    'https://api.example.com',
  );
  expect(formatOllamaApiHost('https://api.example.com/v1')).toBe('https://api.example.com/api');
  expect(isWithTrailingSharp(' https://api.example.com# ')).toBe(true);
});
