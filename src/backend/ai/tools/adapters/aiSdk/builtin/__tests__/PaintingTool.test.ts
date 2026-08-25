import type { ToolExecutionOptions } from 'ai';

import type { PaintingToolDependencies } from '../../../../painting';
import { createConfiguredGenerateImageTool, GENERATE_IMAGE_TOOL_NAME } from '../PaintingTool';

function createDependencies() {
  return {
    ai: {
      generateImage: jest.fn(async () => ({ images: [] })),
    },
    files: {
      createInternalEntry: jest.fn(),
      discard: jest.fn(),
      readDataUrl: jest.fn(),
      resolve: jest.fn(),
    },
    preference: {
      get: jest.fn(async () => 'openai::gpt-image-1'),
    },
    providerRegistry: {
      getImageGenerationSupport: jest.fn(() => ({
        modes: {
          generate: {
            supports: { size: { options: ['1024x1024'], type: 'enum' } },
          },
        },
      })),
    },
  } as unknown as PaintingToolDependencies;
}

describe('standalone generate_image tool', () => {
  test('materializes the configured schema without registering it', async () => {
    const dependencies = createDependencies();
    const imageTool = await createConfiguredGenerateImageTool(dependencies);
    const execute = imageTool.execute as NonNullable<typeof imageTool.execute>;
    const options = {
      experimental_context: { requestId: 'request-1' },
      messages: [],
      toolCallId: 'tool-1',
    } as ToolExecutionOptions;

    expect(GENERATE_IMAGE_TOOL_NAME).toBe('generate_image');
    expect(imageTool.type).toBe('dynamic');
    await expect(execute({ prompt: 'a cat', size: '1024x1024' }, options)).resolves.toEqual([]);
    expect(dependencies.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ paramValues: { size: '1024x1024' } }),
    );
  });

  test('projects generated file ids into a compact model-facing result', async () => {
    const imageTool = await createConfiguredGenerateImageTool(createDependencies());
    const toModelOutput = imageTool.toModelOutput!;

    expect(toModelOutput({ output: [{ id: 'file-1', name: 'painting.png' }] } as never)).toEqual({
      type: 'text',
      value: 'Generated 1 image(s): painting.png (file-1)',
    });
  });
});
