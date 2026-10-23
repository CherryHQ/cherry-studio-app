import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';
import { describe, expect, it } from 'vitest';

import { resolveVoiceEndpoint } from '../voiceEndpoint';
import { makeProvider } from './fixtures';

describe('voice account endpoint', () => {
  it.each([ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, ENDPOINT_TYPE.OPENAI_RESPONSES])(
    'keeps AiHubMix audio on its compatible %s base URL, including copied accounts',
    (endpoint) => {
      const provider = makeProvider({
        id: 'aihubmix-copy',
        presetProviderId: 'aihubmix',
        defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
        endpointConfigs: {
          [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
            adapterFamily: 'aihubmix',
            baseUrl: 'https://aihubmix.com/gemini/v1beta',
          },
          [endpoint]: { adapterFamily: 'aihubmix', baseUrl: 'https://aihubmix.com/v1' },
        },
      });

      expect(resolveVoiceEndpoint(provider)).toBe(endpoint);
      expect(
        resolveVoiceEndpoint({
          ...provider,
          endpointConfigs: {
            [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
              adapterFamily: 'aihubmix',
              baseUrl: 'https://aihubmix.com/gemini/v1beta',
            },
          },
        }),
      ).toBeUndefined();
    },
  );

  it.each([
    ['tts-1', true],
    ['tts-1-hd-1106', true],
    ['gpt-4o-mini-tts', true],
    ['gemini-2.5-flash-preview-tts', true],
    ['gemini-2.5-pro-preview-tts', true],
    ['whisper-1', true],
    ['whisper-large-v3', true],
    ['whisper-large-v3-turbo', true],
    ['distil-whisper-large-v3-en', true],
    ['gpt-realtime-2.1', false],
    ['gpt-audio-1.5', false],
    ['unimplemented-tts', false],
  ])(
    'checks the actual AiHubMix API model %s before offering its audio route',
    (apiModelId, supported) => {
      const endpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
      const provider = makeProvider({
        endpointConfigs: {
          [endpoint]: { adapterFamily: 'aihubmix', baseUrl: 'https://aihubmix.com/v1' },
        },
      });
      expect(resolveVoiceEndpoint(provider, { modelId: 'saved-alias', apiModelId })).toBe(
        supported ? endpoint : undefined,
      );
    },
  );

  it('selects a compatible audio base URL and rejects unsupported account protocols', () => {
    const endpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
    const provider = makeProvider({
      defaultChatEndpoint: endpoint,
      endpointConfigs: {
        [endpoint]: { adapterFamily: 'openai-compatible', baseUrl: 'https://voice.invalid/v1' },
      },
    });
    expect(resolveVoiceEndpoint(provider)).toBe(endpoint);
    expect(resolveVoiceEndpoint({ ...provider, authType: 'iam-gcp' })).toBeUndefined();
    expect(resolveVoiceEndpoint({ ...provider, endpointConfigs: {} })).toBeUndefined();
    expect(
      resolveVoiceEndpoint({
        ...provider,
        endpointConfigs: {
          [endpoint]: { adapterFamily: 'anthropic', baseUrl: 'https://other.invalid' },
        },
      }),
    ).toBeUndefined();
    expect(
      resolveVoiceEndpoint({
        ...provider,
        endpointConfigs: {
          [endpoint]: { adapterFamily: 'openai-compatible', baseUrl: ' ' },
        },
      }),
    ).toBeUndefined();
  });
});
