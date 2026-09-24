import type { AiService } from '../../AiService';
import { createSkillAi } from '../skillAi';

it('uses the configured default model, app language and a tool-free request for explicit discovery', async () => {
  const generateText = jest.fn<
    ReturnType<AiService['generateText']>,
    Parameters<AiService['generateText']>
  >(async () => ({ text: '{"queries":["meeting notes"]}' }));
  const signal = new AbortController().signal;
  const ai = createSkillAi({
    ai: { generateText },
    preference: { get: async () => 'provider::model' } as never,
    models: { getById: async () => ({ capabilities: ['text'], modelId: 'model' }) as never },
    language: async () => 'zh-CN',
  });
  expect(await ai.planSearch('整理会议笔记', signal)).toEqual(['meeting notes']);
  expect(generateText).toHaveBeenCalledWith(
    expect.objectContaining({
      uniqueModelId: 'provider::model',
      system: expect.stringContaining('zh-CN'),
      callOverrides: expect.objectContaining({ tools: {} }),
      requestOptions: { signal, maxRetries: 0 },
    }),
  );
});

it('does not call a model when none is configured', async () => {
  const generateText = jest.fn();
  const ai = createSkillAi({
    ai: { generateText },
    preference: { get: async () => null } as never,
    models: { getById: async () => null },
    language: async () => 'en-US',
  });
  await expect(ai.planSearch('notes')).rejects.toMatchObject({ code: 'ai-model-unconfigured' });
  expect(generateText).not.toHaveBeenCalled();
});
