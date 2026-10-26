import type { SpeechModelV3CallOptions, TranscriptionModelV3CallOptions } from '@ai-sdk/provider';
import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { MockSpeechModelV3, MockTranscriptionModelV3 } from 'ai/test';

import { AiService } from '@/backend/ai/AiService';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { installLogWriter, type LogRecord } from '@/shared/core/logger/LoggerService';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@cherrystudio/ai-runtime/provider', () => ({
  ...jest.requireActual('@cherrystudio/ai-runtime/provider'),
  resolveVoiceModel: jest.fn(),
}));
const mockResolve = jest.requireMock('@cherrystudio/ai-runtime/provider')
  .resolveVoiceModel as jest.Mock;
const speechResult = {
  audio: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
  warnings: [],
  response: { timestamp: new Date(), modelId: 'tts-1' },
};

beforeEach(() => jest.clearAllMocks());

test('rejects an incompatible explicit voice before constructing a request', async () => {
  const f = createContractFixture({
    modelId: 'tts-1',
    capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
  });
  await expect(
    new AiService(f.services).generateSpeech(
      { providerId: f.provider.id, modelId: f.model.modelId, text: 'Hello', voice: 'Kore' },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'invalid-voice' });
  expect(mockResolve).not.toHaveBeenCalled();
});

test('a deleted voice account needs setup rather than failing status with a data error', async () => {
  const f = createContractFixture();
  jest
    .mocked(f.services.provider.getByProviderId)
    .mockRejectedValue(new DataApiError(ErrorCode.NOT_FOUND, 'Deleted account'));
  await expect(
    new AiService(f.services).getVoiceModelStatus(
      { providerId: f.provider.id, modelId: 'whisper-1' },
      'transcription',
      new AbortController().signal,
    ),
  ).resolves.toBe('needs-setup');
  expect(f.spies.resolveApiKey).not.toHaveBeenCalled();
});

test('records upload encoding failure without logging the audio, credentials or provider body', async () => {
  const f = createContractFixture({
    modelId: 'whisper-1',
    capabilities: [MODEL_CAPABILITY.AUDIO_RECOGNITION],
    modelOverrides: { inputModalities: [MODALITY.AUDIO], outputModalities: [MODALITY.TEXT] },
  });
  const records: LogRecord[] = [];
  const uninstall = installLogWriter((record) => records.push(record));
  mockResolve.mockReturnValue(
    new MockTranscriptionModelV3({
      doGenerate: async () => {
        throw Object.assign(new Error('Unsupported FormDataPart implementation'), {
          responseBody: 'private-audio-response contract-key',
        });
      },
    }),
  );
  try {
    await expect(
      new AiService(f.services).transcribe(
        {
          providerId: f.provider.id,
          modelId: f.model.modelId,
          audio: new Uint8Array([1, 2, 3]),
          mediaType: 'audio/mp4',
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'upload-failed' });
    const failures = records.filter((record) => record.message === 'Voice request failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      module: 'AiService',
      operation: 'transcription',
      phase: 'request',
      providerId: f.provider.id,
      modelId: f.model.modelId,
      code: 'upload-failed',
    });
    expect(failures[0]).not.toHaveProperty('audio');
    expect(JSON.stringify(failures)).not.toContain('contract-key');
    expect(JSON.stringify(failures)).not.toContain('private-audio-response');
  } finally {
    uninstall();
  }
});

test('serves an AiHubMix Gemini speech alias through its audio URL instead of its Gemini chat URL', async () => {
  const f = createContractFixture({
    modelId: 'saved-speech',
    capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
    modelOverrides: {
      apiModelId: 'gemini-2.5-flash-preview-tts',
      endpointTypes: [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT],
    },
    providerOverrides: {
      presetProviderId: 'aihubmix',
      defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      endpointConfigs: {
        [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
          adapterFamily: 'aihubmix',
          baseUrl: 'https://aihubmix.com/gemini/v1beta',
        },
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          adapterFamily: 'aihubmix',
          baseUrl: 'https://aihubmix.com/v1',
        },
      },
    },
  });
  const generate = jest.fn(async (_options: SpeechModelV3CallOptions) => speechResult);
  mockResolve.mockReturnValue(new MockSpeechModelV3({ doGenerate: generate }));
  await new AiService(f.services).generateSpeech(
    { providerId: f.provider.id, modelId: f.model.modelId, text: '你好' },
    new AbortController().signal,
  );
  expect(mockResolve).toHaveBeenCalledWith(
    expect.objectContaining({
      modelId: 'gemini-2.5-flash-preview-tts',
      adapterFamily: 'aihubmix',
      settings: expect.objectContaining({
        baseURL: 'https://aihubmix.com/v1',
        apiKey: 'contract-key',
      }),
    }),
    'speech',
  );
  expect(generate.mock.calls[0][0].voice).toBe('Kore');
  const choices = await new AiService(f.services).getSpeechModelOptions(
    { providerId: f.provider.id, modelId: f.model.modelId },
    new AbortController().signal,
  );
  expect(choices.defaultVoice).toBe('Kore');
  expect(choices.voices.some(({ id }) => id === 'Kore')).toBe(true);
  expect(choices.voices.some(({ id }) => id === 'alloy')).toBe(false);

  f.model.apiModelId = 'unimplemented-tts';
  mockResolve.mockClear();
  await expect(
    new AiService(f.services).generateSpeech(
      { providerId: f.provider.id, modelId: f.model.modelId, text: '你好', voice: 'alloy' },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'not-configured' });
  expect(mockResolve).not.toHaveBeenCalled();
});

test('uses the saved speech model API ID and selected account without inventing usage', async () => {
  const f = createContractFixture({
    modelId: 'saved-speech-model',
    capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
    modelOverrides: { apiModelId: 'tts-1' },
  });
  const generate = jest.fn(async (_options: SpeechModelV3CallOptions) => speechResult);
  mockResolve.mockReturnValue(new MockSpeechModelV3({ doGenerate: generate }));
  const result = await new AiService(f.services).generateSpeech(
    { providerId: f.provider.id, modelId: f.model.modelId, text: '你好', voice: 'alloy' },
    new AbortController().signal,
  );
  expect(f.spies.resolveApiKey).toHaveBeenCalledWith(f.provider.id, undefined);
  expect(mockResolve).toHaveBeenCalledWith(
    {
      adapterFamily: 'openai-compatible',
      modelId: 'tts-1',
      settings: expect.objectContaining({
        apiKey: 'contract-key',
        baseURL: 'https://contract.invalid/v1',
        fetch: expect.any(Function),
      }),
    },
    'speech',
  );
  expect(generate.mock.calls[0][0]).toMatchObject({
    text: '你好',
    voice: 'alloy',
    outputFormat: 'wav',
  });
  expect(result).toEqual({ audio: speechResult.audio, mediaType: 'audio/wav' });
  expect(f.spies.recordInvocation).not.toHaveBeenCalled();
});

test('transcribes original bytes with their stated container type, using the audio model and selected account', async () => {
  const f = createContractFixture({
    modelId: 'whisper-1',
    capabilities: [MODEL_CAPABILITY.AUDIO_RECOGNITION],
    modelOverrides: { inputModalities: [MODALITY.AUDIO], outputModalities: [MODALITY.TEXT] },
  });
  const generate = jest.fn(async (_options: TranscriptionModelV3CallOptions) => ({
    text: '你好',
    segments: [],
    language: 'zh',
    durationInSeconds: 1,
    warnings: [],
    response: { timestamp: new Date(), modelId: 'whisper-1' },
  }));
  mockResolve.mockReturnValue(new MockTranscriptionModelV3({ doGenerate: generate }));
  // An M4A header: ai-sdk alone would sniff this as WAV.
  const audio = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112, 77, 52, 65, 32]);
  const result = await new AiService(f.services).transcribe(
    { providerId: f.provider.id, modelId: 'whisper-1', audio, mediaType: 'audio/mp4' },
    new AbortController().signal,
  );
  expect(result.text).toBe('你好');
  expect(generate.mock.calls[0][0].audio).toEqual(audio);
  expect(mockResolve.mock.calls[0][2]).toBe('audio/mp4');
  expect(mockResolve.mock.calls[0][1]).toBe('transcription');
});

test.each([401, 404, 503])(
  'normalizes HTTP %i failure once and redacts the serving credential',
  async (statusCode) => {
    const f = createContractFixture({
      modelId: 'unknown-audio',
      capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
    });
    const generate = jest.fn(async () => {
      throw Object.assign(new Error('contract-key rejected'), {
        statusCode,
        responseBody: 'api_key=contract-key',
      });
    });
    mockResolve.mockReturnValue(new MockSpeechModelV3({ doGenerate: generate }));
    const error = await new AiService(f.services)
      .generateSpeech(
        { providerId: f.provider.id, modelId: 'unknown-audio', text: 'Hi', voice: 'alloy' },
        new AbortController().signal,
      )
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AiRequestError);
    expect(error).toMatchObject({
      detail: {
        failure: { context: { providerId: f.provider.id, modelId: 'unknown-audio', statusCode } },
      },
    });
    expect(JSON.stringify(error)).not.toContain('contract-key');
    expect(generate).toHaveBeenCalledTimes(1);
  },
);

test('passes cancellation to the provider and keeps the abort reason', async () => {
  const f = createContractFixture({
    modelId: 'tts-1',
    capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
  });
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let signal: AbortSignal | undefined;
  mockResolve.mockReturnValue(
    new MockSpeechModelV3({
      doGenerate: async (options) => {
        signal = options.abortSignal;
        started();
        return new Promise((_, reject) =>
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }),
        );
      },
    }),
  );
  const controller = new AbortController();
  const reason = new Error('cancel voice');
  const pending = new AiService(f.services).generateSpeech(
    { providerId: f.provider.id, modelId: 'tts-1', text: 'Hi', voice: 'alloy' },
    controller.signal,
  );
  const rejected = expect(pending).rejects.toBe(reason);
  await ready;
  controller.abort(reason);
  await rejected;
  expect(signal?.aborted).toBe(true);
});

test('rejects unsupported and disabled accounts before selecting a credential', async () => {
  for (const providerOverrides of [{ isEnabled: false }, { endpointConfigs: {} }]) {
    const f = createContractFixture({ providerOverrides });
    await expect(
      new AiService(f.services).transcribe(
        {
          providerId: f.provider.id,
          modelId: 'whisper-1',
          audio: new Uint8Array([1]),
          mediaType: 'audio/mpeg',
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'not-configured' });
    expect(f.spies.resolveApiKey).not.toHaveBeenCalled();
  }
});

test.each([
  ['missing', { modelId: 'another-model' }],
  ['disabled', { modelOverrides: { isEnabled: false } }],
  ['hidden', { modelOverrides: { isHidden: true } }],
  ['wrong purpose', { capabilities: [MODEL_CAPABILITY.AUDIO_TRANSCRIPT] }],
] satisfies [string, NonNullable<Parameters<typeof createContractFixture>[0]>][])(
  'rejects a %s speech model before selecting a credential',
  async (_name, options) => {
    const f = createContractFixture({
      modelId: 'tts-1',
      capabilities: [MODEL_CAPABILITY.AUDIO_GENERATION],
      ...options,
    });
    await expect(
      new AiService(f.services).generateSpeech(
        { providerId: f.provider.id, modelId: 'tts-1', text: 'Hello', voice: 'alloy' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'not-configured' });
    expect(f.spies.resolveApiKey).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  },
);
