import type { CherryMessagePart } from '@/shared/data/types/message';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

import { extractMainText, maybeRenameTopicFromConversationSummary } from '../topicNaming';

const defaultModelId = 'openai::gpt-4o' as UniqueModelId;

function createServices(
  overrides: {
    generateText?: jest.Mock;
    modelGetById?: jest.Mock;
    preferences?: Record<string, unknown>;
    topicGetById?: jest.Mock;
    topicUpdate?: jest.Mock;
  } = {},
) {
  const preferences: Record<string, unknown> = {
    'app.language': 'en-US',
    'topic.naming.enabled': true,
    'topic.naming.model_id': null,
    'topic.naming_prompt': '',
    ...overrides.preferences,
  };

  return {
    ai: {
      generateText: overrides.generateText ?? jest.fn(async () => ({ text: 'Generated Title' })),
    },
    model: {
      getById: overrides.modelGetById ?? jest.fn(async (id: UniqueModelId) => createModel(id)),
    },
    preference: {
      get: jest.fn(async (key: string) => preferences[key]),
    },
    topic: {
      getById:
        overrides.topicGetById ??
        jest.fn(async () => ({ id: 'topic-1', isNameManuallyEdited: false, name: 'Old name' })),
      update: overrides.topicUpdate ?? jest.fn(async () => undefined),
    },
  } as any;
}

function createModel(id: UniqueModelId): Model {
  return {
    capabilities: [],
    id,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: id.split('::')[1] ?? 'model',
    name: 'Model',
    providerId: id.split('::')[0] ?? 'provider',
    supportsStreaming: true,
  };
}

describe('extractMainText', () => {
  it('joins text parts and drops non-text parts', () => {
    const parts = [
      { text: '  hello  ', type: 'text' },
      { filename: 'a.pdf', type: 'file', url: 'file://a.pdf' },
      { text: 'world', type: 'text' },
    ] as CherryMessagePart[];

    expect(extractMainText(parts)).toBe('hello\n\nworld');
  });

  it('returns an empty string when there are no text parts', () => {
    const parts = [{ filename: 'a.pdf', type: 'file', url: 'file://a.pdf' }] as CherryMessagePart[];
    expect(extractMainText(parts)).toBe('');
  });
});

describe('maybeRenameTopicFromConversationSummary', () => {
  it('renames the topic using the generated title', async () => {
    const services = createServices();

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantId: 'assistant-1',
      assistantText: 'Sure, here is how...',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'How do I set up CI?',
    });

    expect(renamed).toBe(true);
    expect(services.ai.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-1',
        uniqueModelId: defaultModelId,
      }),
    );
    expect(services.topic.update).toHaveBeenCalledWith('topic-1', {
      isNameManuallyEdited: false,
      name: 'Generated Title',
    });
  });

  it('does nothing when topic naming is disabled', async () => {
    const services = createServices({ preferences: { 'topic.naming.enabled': false } });

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(renamed).toBe(false);
    expect(services.ai.generateText).not.toHaveBeenCalled();
  });

  it('does not rename a topic the user already renamed manually', async () => {
    const services = createServices({
      topicGetById: jest.fn(async () => ({
        id: 'topic-1',
        isNameManuallyEdited: true,
        name: 'My custom name',
      })),
    });

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(renamed).toBe(false);
    expect(services.ai.generateText).not.toHaveBeenCalled();
  });

  it('re-checks for a manual rename race after the LLM call resolves', async () => {
    const topicGetById = jest
      .fn()
      .mockResolvedValueOnce({ id: 'topic-1', isNameManuallyEdited: false, name: 'Old name' })
      .mockResolvedValueOnce({
        id: 'topic-1',
        isNameManuallyEdited: true,
        name: 'Renamed while streaming',
      });
    const services = createServices({ topicGetById });

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(renamed).toBe(false);
    expect(services.topic.update).not.toHaveBeenCalled();
  });

  it('uses the configured naming model when it still exists', async () => {
    const configuredModelId = 'anthropic::claude-3-7-sonnet' as UniqueModelId;
    const services = createServices({
      preferences: { 'topic.naming.model_id': configuredModelId },
    });

    await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(services.model.getById).toHaveBeenCalledWith(configuredModelId);
    expect(services.ai.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueModelId: configuredModelId }),
    );
  });

  it('falls back to the turn model when the configured naming model no longer exists', async () => {
    const configuredModelId = 'anthropic::deleted-model' as UniqueModelId;
    const services = createServices({
      modelGetById: jest.fn(async () => null),
      preferences: { 'topic.naming.model_id': configuredModelId },
    });

    await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(services.ai.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueModelId: defaultModelId }),
    );
  });

  it('substitutes {{language}} in the naming prompt', async () => {
    const services = createServices({
      preferences: { 'app.language': 'zh-CN' },
    });

    await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(services.ai.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.stringContaining('zh-CN') }),
    );
  });

  it('sanitizes quotes and newlines out of the generated title', async () => {
    const services = createServices({
      generateText: jest.fn(async () => ({ text: '"Weird\nTitle\r\n"' })),
    });

    await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(services.topic.update).toHaveBeenCalledWith('topic-1', {
      isNameManuallyEdited: false,
      name: 'Weird Title',
    });
  });

  it('does not update when the generated title is empty after sanitizing', async () => {
    const services = createServices({ generateText: jest.fn(async () => ({ text: '   ' })) });

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(renamed).toBe(false);
    expect(services.topic.update).not.toHaveBeenCalled();
  });

  it('returns false and logs instead of throwing when the LLM call fails', async () => {
    const services = createServices({
      generateText: jest.fn(async () => {
        throw new Error('network error');
      }),
    });

    const renamed = await maybeRenameTopicFromConversationSummary({
      assistantText: 'reply',
      defaultModelId,
      services,
      topicId: 'topic-1',
      userText: 'question',
    });

    expect(renamed).toBe(false);
  });
});
