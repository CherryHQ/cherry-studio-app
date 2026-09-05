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

  test.each([CreateAgentSchema, UpdateAgentSchema])(
    'rejects removed per-Agent inference settings',
    (schema) => {
      expect(
        schema.safeParse({
          name: 'Agent',
          settings: { maxOutputTokens: 2048, reasoningEffort: 'high', temperature: 0.5 },
        }).success,
      ).toBe(false);
    },
  );

  test.each([CreateAgentSchema, UpdateAgentSchema])(
    'rejects avatar writes — the avatar workflow owns that column',
    (schema) => {
      expect(schema.safeParse({ avatar: 'agent-avatar-file:x.webp', name: 'Agent' }).success).toBe(
        false,
      );
    },
  );
});
