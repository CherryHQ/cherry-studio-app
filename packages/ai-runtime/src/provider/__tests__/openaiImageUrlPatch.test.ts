import { OpenAIImageModel } from '@ai-sdk/openai/internal';
import { describe, expect, it } from 'vitest';

// Guards patches/@ai-sdk__openai@3.0.137.patch: CherryIN and DMXAPI route models
// that return data[].url through OpenAIImageModel, whose upstream schema requires
// b64_json. Keep URL support for generation and editing, with Base64 preferred when
// both are present. The patched ai.generateImage owns downloading URL results.
describe.each(['generate', 'edit'] as const)('patched @ai-sdk/openai image %s schema', (mode) => {
  it('parses a 200 whose data carries a url instead of b64_json', async () => {
    const model = imageModel({ data: [{ url: 'https://cdn.example/kolors.png' }] });

    const result = await model.doGenerate(generateOptions(mode));

    expect(result.images).toEqual(['https://cdn.example/kolors.png']);
  });

  it('still prefers b64_json when the provider returns it', async () => {
    const model = imageModel({
      data: [{ b64_json: 'QUJD', url: 'https://cdn.example/kolors.png' }],
    });

    const result = await model.doGenerate(generateOptions(mode));

    expect(result.images).toEqual(['QUJD']);
  });
});

function imageModel(body: unknown) {
  return new OpenAIImageModel('kolors', {
    provider: 'cherryin.image',
    url: ({ path }) => `https://api.cherry-ai.com/v1${path}`,
    headers: () => ({}),
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
}

function generateOptions(mode: 'generate' | 'edit'): Parameters<OpenAIImageModel['doGenerate']>[0] {
  return {
    aspectRatio: undefined,
    files:
      mode === 'edit'
        ? [{ type: 'file', mediaType: 'image/png', data: new Uint8Array([1]) }]
        : undefined,
    mask: undefined,
    n: 1,
    prompt: 'a cat',
    providerOptions: {},
    seed: undefined,
    size: '1024x1024',
  };
}
