import { CreateAgentSchema, ListAgentsQuerySchema, UpdateAgentSchema } from '../agents';

describe('agent api schemas', () => {
  test('fills agent list pagination defaults', () => {
    expect(ListAgentsQuerySchema.parse({})).toMatchObject({
      limit: 100,
      page: 1,
    });
  });

  test.each([CreateAgentSchema, UpdateAgentSchema])(
    'accepts a nullable model assignment',
    (schema) => {
      expect(schema.safeParse({ modelId: 'openai::gpt-4', name: 'Agent' }).success).toBe(true);
      expect(schema.safeParse({ modelId: null, name: 'Agent' }).success).toBe(true);
    },
  );

  test('accepts partial settings updates without requiring the full settings object', () => {
    expect(UpdateAgentSchema.safeParse({ settings: { reasoningEffort: 'high' } }).success).toBe(
      true,
    );
  });

  test.each([CreateAgentSchema, UpdateAgentSchema])(
    'accepts only supported tool approval modes',
    (schema) => {
      expect(schema.safeParse({ name: 'Agent', toolApprovalMode: 'default' }).success).toBe(true);
      expect(schema.safeParse({ name: 'Agent', toolApprovalMode: 'auto' }).success).toBe(true);
      expect(schema.safeParse({ name: 'Agent', toolApprovalMode: 'full-access' }).success).toBe(
        false,
      );
    },
  );

  test('keeps unknown settings fields in update payloads', () => {
    expect(
      UpdateAgentSchema.parse({
        settings: { futureSetting: { enabled: true }, temperature: 0.5 },
      }),
    ).toEqual({
      settings: { futureSetting: { enabled: true }, temperature: 0.5 },
    });
  });

  test('preserves explicit-undefined settings keys so a patch can clear them', () => {
    const parsed = UpdateAgentSchema.parse({ settings: { temperature: undefined } });

    expect(parsed.settings).toBeDefined();
    expect(Object.keys(parsed.settings ?? {})).toContain('temperature');
  });

  test.each([CreateAgentSchema, UpdateAgentSchema])(
    'rejects avatar writes — the avatar workflow owns that column',
    (schema) => {
      expect(schema.safeParse({ avatar: 'agent-avatar-file:x.webp', name: 'Agent' }).success).toBe(
        false,
      );
    },
  );
});
