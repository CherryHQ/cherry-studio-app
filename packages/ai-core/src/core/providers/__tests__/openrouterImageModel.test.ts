import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateImage } from 'ai';

describe('OpenRouter image response MIME patch', () => {
  it('preserves media_type through the AI SDK generated file', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ b64_json: 'PHN2Zz48L3N2Zz4=', media_type: 'image/svg+xml' }],
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      );
    const openrouter = createOpenRouter({ apiKey: 'test-key', fetch });

    const result = await generateImage({
      model: openrouter.imageModel('recraft/recraft-v4.1-vector'),
      prompt: 'vector fox',
    });

    expect(result.image.mediaType).toBe('image/svg+xml');
    expect(result.image.base64).toBe('PHN2Zz48L3N2Zz4=');
  });
});
