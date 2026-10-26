import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';
import { describe, expect, it } from 'vitest';

import { resolveVoiceEndpoint } from '../voiceEndpoint';
import { makeProvider } from './fixtures';

describe('voice account endpoint', () => {
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
