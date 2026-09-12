import { OpenAIImageModel } from '@ai-sdk/openai/internal';
import { describe, expect, it } from 'vitest';

// Guards the image hunks in patches/@ai-sdk__openai@3.0.53.patch. The upstream
// image response schema requires `data[].b64_json`, but aggregator gateways route
// url-returning models here: CherryIN sends everything that is neither Google nor
// Qwen to `OpenAIImageModel` (packages/ai-sdk-provider cherryin-provider.ts), and
// so does dmxapi. Kolors answers with `data: [{ url }]` — a valid HTTP 200 that,
// unpatched, fails schema validation (AI_TypeValidationError → "Invalid JSON
// response") and breaks every such generation. The patch makes `b64_json` optional,
// accepts `url`, and maps whichever is present; `ai`'s patched `generateImage` then
// downloads the url into base64. The sibling patch for @ai-sdk/openai-compatible has
// carried the same hunks all along — this one only caught up. If an SDK upgrade drops
// the patch, this test fails loudly.
describe('patched @ai-sdk/openai image schema tolerates url-returning models', () => {
  it('parses a 200 whose data carries a url instead of b64_json', async () => {
    const model = imageModel({ data: [{ url: 'https://cdn.example/kolors.png' }] });

    const result = await model.doGenerate(generateOptions());

    expect(result.images).toEqual(['https://cdn.example/kolors.png']);
  });

  it('still prefers b64_json when the provider returns it', async () => {
    const model = imageModel({ data: [{ b64_json: 'QUJD' }] });

    const result = await model.doGenerate(generateOptions());

    expect(result.images).toEqual(['QUJD']);
  });
});

function imageModel(body: unknown) {
  return new OpenAIImageModel('kolors', {
    provider: 'cherryin.image',
    url: () => 'https://api.cherry-ai.com/v1/images/generations',
    headers: () => ({}),
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
}

function generateOptions(): Parameters<OpenAIImageModel['doGenerate']>[0] {
  return {
    aspectRatio: undefined,
    files: undefined,
    mask: undefined,
    n: 1,
    prompt: 'a cat',
    providerOptions: {},
    seed: undefined,
    size: '1024x1024',
  };
}
