import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { describe, expect, it } from 'vitest';

import { captureWithFetch } from '../custom/__tests__/boundary/captureRequest';

// Guards the model-path and image-routing behavior retained by the Google SDK patch.
describe('patched Google image routing', () => {
  it.each([
    ['imagen-4.0-generate-001', 'models/imagen-4.0-generate-001:predict'],
    ['models/imagen-4.0-generate-001', 'models/imagen-4.0-generate-001:predict'],
    ['google/imagen-4.0-generate-001', 'models/google/imagen-4.0-generate-001:predict'],
    ['gemini-2.5-flash-image', 'models/gemini-2.5-flash-image:generateContent'],
    ['models/gemini-2.5-flash-image', 'models/gemini-2.5-flash-image:generateContent'],
    ['google/gemini-2.5-flash-image', 'models/google/gemini-2.5-flash-image:generateContent'],
  ])('routes %s to the expected image endpoint', async (modelId, path) => {
    const request = await captureWithFetch((fetch) =>
      createGoogleGenerativeAI({
        apiKey: 'test-key',
        baseURL: 'https://google.example.com/v1beta',
        fetch,
      })
        .image(modelId)
        .doGenerate({
          aspectRatio: undefined,
          files: undefined,
          mask: undefined,
          n: 1,
          prompt: 'a cat',
          providerOptions: {},
          seed: undefined,
          size: undefined,
        }),
    );

    expect(request.url).toBe(`https://google.example.com/v1beta/${path}`);
    expect(request.method).toBe('POST');
    expect(request.body).toMatchObject(
      path.endsWith(':predict')
        ? { instances: [{ prompt: 'a cat' }] }
        : { generationConfig: { responseModalities: ['IMAGE'] } },
    );
  });
});
