import {
  CreateAssistantSchema,
  DeleteAssistantQuerySchema,
  ImportAssistantSchema,
  ListAssistantsQuerySchema,
  UpdateAssistantSchema,
} from '../assistants';

describe('assistant api schemas', () => {
  test('fills assistant list pagination defaults', () => {
    expect(ListAssistantsQuerySchema.parse({})).toMatchObject({
      limit: 100,
      page: 1,
    });
  });

  test('accepts desktop sorting query fields', () => {
    expect(
      ListAssistantsQuerySchema.parse({
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        updatedAtFrom: '2026-05-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      updatedAtFrom: '2026-05-01T00:00:00.000Z',
    });
  });

  test.each([CreateAssistantSchema, UpdateAssistantSchema])(
    'accepts a nullable model assignment',
    (schema) => {
      expect(schema.safeParse({ modelId: 'openai::gpt-4', name: 'Assistant' }).success).toBe(true);
      expect(schema.safeParse({ modelId: null, name: 'Assistant' }).success).toBe(true);
    },
  );

  test('accepts partial settings updates without requiring the full settings object', () => {
    const result = UpdateAssistantSchema.safeParse({
      settings: {
        reasoning_effort: 'high',
      },
    });

    expect(result.success).toBe(true);
  });

  test('keeps unknown settings fields in partial update payloads', () => {
    expect(
      UpdateAssistantSchema.parse({
        settings: {
          futureDesktopSetting: { enabled: true },
          toolUseMode: 'prompt',
        },
      }),
    ).toEqual({
      settings: {
        futureDesktopSetting: { enabled: true },
        toolUseMode: 'prompt',
      },
    });
  });

  test('rejects fields outside the import contract', () => {
    expect(
      ImportAssistantSchema.parse({
        name: 'Imported Assistant',
        prompt: 'legacy prompt',
      }),
    ).toEqual({ name: 'Imported Assistant', prompt: 'legacy prompt' });
    expect(
      ImportAssistantSchema.safeParse({
        modelId: 'openai::gpt-4',
        name: 'Imported Assistant',
      }).success,
    ).toBe(false);
  });

  test('accepts only the optional deleteTopics flag for assistant deletion', () => {
    expect(DeleteAssistantQuerySchema.parse({})).toEqual({});
    expect(DeleteAssistantQuerySchema.parse({ deleteTopics: true })).toEqual({
      deleteTopics: true,
    });
    expect(DeleteAssistantQuerySchema.safeParse({ deleteTopics: 'true' }).success).toBe(false);
  });

  test.each([CreateAssistantSchema, UpdateAssistantSchema])(
    'keeps MCP writes but rejects deferred knowledge-base relation writes',
    (schema) => {
      expect(schema.safeParse({ mcpServerIds: ['mcp-1'], name: 'Assistant' }).success).toBe(true);
      expect(
        schema.safeParse({
          name: 'Assistant',
          knowledgeBaseIds: ['knowledge-1'],
          mcpServerIds: ['mcp-1'],
        }).success,
      ).toBe(false);
    },
  );
});
