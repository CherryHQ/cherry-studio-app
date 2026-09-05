import { AssistantSchema, AssistantSettingsSchema, DEFAULT_ASSISTANT_SETTINGS } from '../assistant';

describe('assistant data schemas', () => {
  test('keeps reasoning effort in the default settings payload', () => {
    expect(DEFAULT_ASSISTANT_SETTINGS.reasoning_effort).toBe('default');
  });

  test('rejects non-canonical reasoning effort values', () => {
    expect(
      AssistantSettingsSchema.safeParse({
        ...DEFAULT_ASSISTANT_SETTINGS,
        reasoning_effort: 'turbo',
      }).success,
    ).toBe(false);
  });

  test('round-trips settings fields introduced by another Cherry client', () => {
    const parsed = AssistantSettingsSchema.parse({
      ...DEFAULT_ASSISTANT_SETTINGS,
      futureDesktopSetting: { enabled: true },
    });

    expect(parsed).toMatchObject({
      futureDesktopSetting: { enabled: true },
    });
  });

  test('does not add the retired mobile-only tool use mode to new assistants', () => {
    expect(DEFAULT_ASSISTANT_SETTINGS).not.toHaveProperty('toolUseMode');
  });

  test('still round-trips a tool use mode already stored by an older mobile build', () => {
    const parsed = AssistantSettingsSchema.parse({
      ...DEFAULT_ASSISTANT_SETTINGS,
      toolUseMode: 'prompt',
    });

    expect(parsed).toHaveProperty('toolUseMode', 'prompt');
  });

  test('includes the desktop ordering key in assistant entities', () => {
    const assistant = AssistantSchema.parse({
      createdAt: '2026-01-01T00:00:00.000Z',
      description: '',
      emoji: '😀',
      id: '00000000-0000-4000-8000-000000000001',
      mcpServerIds: [],
      modelId: null,
      modelName: null,
      name: 'Assistant',
      orderKey: 'a0',
      prompt: '',
      settings: DEFAULT_ASSISTANT_SETTINGS,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(assistant.orderKey).toBe('a0');
  });

  test('rejects non-emoji assistant icons', () => {
    expect(
      AssistantSchema.safeParse({
        createdAt: '2026-01-01T00:00:00.000Z',
        description: '',
        emoji: 'assistant',
        id: '00000000-0000-4000-8000-000000000001',
        mcpServerIds: [],
        modelId: null,
        modelName: null,
        name: 'Assistant',
        orderKey: 'a0',
        prompt: '',
        settings: DEFAULT_ASSISTANT_SETTINGS,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
