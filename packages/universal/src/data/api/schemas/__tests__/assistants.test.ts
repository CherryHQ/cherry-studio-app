import {
  CreateAssistantSchema,
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

  test('accepts desktop group and sorting query fields', () => {
    expect(
      ListAssistantsQuerySchema.parse({
        groupId: '11111111-1111-4111-8111-111111111111',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        updatedAtFrom: '2026-05-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      groupId: '11111111-1111-4111-8111-111111111111',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      updatedAtFrom: '2026-05-01T00:00:00.000Z',
    });
  });

  test.each([CreateAssistantSchema, UpdateAssistantSchema])(
    'accepts a nullable group assignment',
    (schema) => {
      expect(
        schema.safeParse({
          groupId: '11111111-1111-4111-8111-111111111111',
          name: 'Assistant',
        }).success,
      ).toBe(true);
      expect(schema.safeParse({ groupId: null, name: 'Assistant' }).success).toBe(true);
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

  test.each([CreateAssistantSchema, UpdateAssistantSchema])(
    'rejects MCP and knowledge-base relation writes',
    (schema) => {
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
