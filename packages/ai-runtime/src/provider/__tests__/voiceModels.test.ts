import { generateSpeech, transcribe } from '@cherrystudio/ai-core';
import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';
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
          adapterFamily: 'openai-compatible',
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
          adapterFamily: 'openai',
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
      const config = {
        adapterFamily: 'openai' as const,
        modelId: 'unsupported',
        settings: { apiKey: 'key', fetch },
      };
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

  it('reuses AiHubMix audio headers and preserves the resolved audio URL and Gemini voice', async () => {
    const audio = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(audio));
    const settings = {
      apiKey: 'key',
      baseURL: 'https://audio.invalid/v1',
      fetch,
      endpointBaseURLs: { [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'https://chat.invalid/v1' },
    };
    await generateSpeech(
      resolveVoiceModel(
        { adapterFamily: 'aihubmix', modelId: 'gemini-2.5-flash-preview-tts', settings },
        'speech',
      ),
      'Hello',
      { voice: 'Kore' },
      new AbortController().signal,
    );
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://audio.invalid/v1/audio/speech');
    expect(new Headers(init?.headers).get('APP-Code')).toBe('MLTG2087');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      voice: 'Kore',
      response_format: 'wav',
    });
  });

  it.each(['openai', 'aihubmix'] as const)(
    'keeps M4A bytes, MIME and multipart filename through %s transcription',
    async (adapterFamily) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        new Response(JSON.stringify({ text: 'hello' }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
      const audio = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112, 77, 52, 65, 32]);
      await transcribe(
        resolveVoiceModel(
          { adapterFamily, modelId: 'whisper-1', settings: { apiKey: 'key', fetch } },
          'transcription',
          'audio/mp4',
        ),
        audio,
        {},
        new AbortController().signal,
      );
      const body = fetch.mock.calls[0][1]?.body as FormData;
      const file = body.get('file') as File;
      expect(file.name).toBe('audio.mp4');
      expect(file.type).toBe('audio/mp4');
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
    },
  );
});
