import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';
import * as z from 'zod';

import { buildGenerateImageToolSchema, generateImageInputSchema } from '../generateImageTool';

describe('generate_image input contract', () => {
  test('keeps the fallback schema prompt-only', () => {
    const json = z.toJSONSchema(generateImageInputSchema) as { required?: unknown };

    expect(json.required).toEqual(['prompt']);
    expect(generateImageInputSchema.safeParse({ prompt: 'a cat' }).success).toBe(true);
    expect(generateImageInputSchema.safeParse({ n: 2, prompt: 'a cat' }).success).toBe(false);
  });

  test('derives optional generation parameters from model support', () => {
    const support = {
      modes: {
        generate: {
          supports: {
            numImages: { max: 3, min: 1, type: 'range' },
            size: { options: ['1024x1024', '1792x1024'], type: 'enum' },
          },
        },
      },
    } satisfies ImageGenerationSupport;
    const inputSchema = buildGenerateImageToolSchema(support);

    expect(
      inputSchema.safeParse({ numImages: 2, prompt: 'a cat', size: '1792x1024' }).success,
    ).toBe(true);
    expect(inputSchema.safeParse({ prompt: 'a cat', size: '2048x2048' }).success).toBe(false);
    expect(z.toJSONSchema(inputSchema)).not.toHaveProperty('properties.image_ids');
  });

  test('requires one image reference for edit-only models', () => {
    const support = {
      modes: {
        edit: {
          supports: { quality: { options: ['low', 'high'], type: 'enum' } },
        },
      },
    } satisfies ImageGenerationSupport;
    const inputSchema = buildGenerateImageToolSchema(support);

    expect(inputSchema.safeParse({ image_ids: ['file-1'], prompt: 'edit it' }).success).toBe(true);
    expect(inputSchema.safeParse({ prompt: 'edit it' }).success).toBe(false);
    expect(
      inputSchema.safeParse({ image_ids: ['file-1', 'file-2'], prompt: 'edit it' }).success,
    ).toBe(false);
  });
});
