import { generateSpeech, transcribe } from '@cherrystudio/ai-core';
import { describe, expect, it, vi } from 'vitest';

import { resolveVoiceModel } from '../voiceModels';

describe('voice model adaptation', () => {
  it('uses the selected audio model, credential, custom header and WAV response format', async () => {
    const audio = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(audio, { headers: { 'content-type': 'audio/wav' } }));
    const signal = new AbortController().signal;
    const result = await generateSpeech(
      resolveVoiceModel(
        {
          modelId: 'custom-tts',
          settings: {
            apiKey: 'selected-key',
            baseURL: 'https://voice.invalid/v1',
            headers: { 'X-Account': 'one' },
            fetch,
          },
        },
        'speech',
      ),
      '你好',
      { voice: 'alloy' },
      signal,
    );
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://voice.invalid/v1/audio/speech');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer selected-key');
    expect(new Headers(init?.headers).get('X-Account')).toBe('one');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'custom-tts',
      input: '你好',
      voice: 'alloy',
      response_format: 'wav',
    });
    expect(init?.signal).toBeDefined();
    expect(result).toEqual({ audio, mediaType: 'audio/wav' });
  });

  it('uploads original audio bytes as multipart and returns multilingual transcript text', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: '你好, hello' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
    const result = await transcribe(
      resolveVoiceModel(
        {
          modelId: 'whisper-1',
          settings: { apiKey: 'selected-key', baseURL: 'https://voice.invalid/v1', fetch },
        },
        'transcription',
      ),
      bytes,
      {},
      new AbortController().signal,
    );
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://voice.invalid/v1/audio/transcriptions');
    const body = init?.body as FormData;
    expect(body.get('model')).toBe('whisper-1');
    expect(new Uint8Array(await (body.get('file') as Blob).arrayBuffer())).toEqual(bytes);
    expect(result.text).toBe('你好, hello');
  });

  it.each(['speech', 'transcription'] as const)(
    'does not retry a transient %s failure',
    async (operation) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'busy' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const config = { modelId: 'unsupported', settings: { apiKey: 'key', fetch } };
      const result =
        operation === 'speech'
          ? generateSpeech(
              resolveVoiceModel(config, 'speech'),
              'hello',
              { voice: 'alloy' },
              new AbortController().signal,
            )
          : transcribe(
              resolveVoiceModel(config, 'transcription'),
              new Uint8Array([1, 2, 3]),
              {},
              new AbortController().signal,
            );
      await expect(result).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
