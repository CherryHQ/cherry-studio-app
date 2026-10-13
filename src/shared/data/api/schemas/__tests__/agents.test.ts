import { CreateAgentSchema, ListAgentsQuerySchema, UpdateAgentSchema } from '../agents';

describe('agent api schemas', () => {
  test.each([CreateAgentSchema, UpdateAgentSchema])('accepts only fixed Agent modes', (schema) => {
    for (const mode of ['standard', 'minimal']) {
      expect(schema.safeParse({ name: 'Agent', mode }).success).toBe(true);
    }
    expect(schema.safeParse({ name: 'Agent', mode: 'custom' }).success).toBe(false);
  });

  test('an unrelated update does not reset the stored mode', () => {
    expect(UpdateAgentSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  test('fills agent list pagination defaults', () => {
    expect(ListAgentsQuerySchema.parse({})).toMatchObject({
      limit: 100,
      page: 1,
    });
  });

  test.each([CreateAgentSchema, UpdateAgentSchema])(
    'accepts a nullable model assignment',
    (schema) => {
      expect(schema.safeParse({ model: 'openai::gpt-4', name: 'Agent' }).success).toBe(true);
      expect(schema.safeParse({ model: null, name: 'Agent' }).success).toBe(true);
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
    'rejects managed avatar references — the image workflow owns those writes',
    (schema) => {
      expect(schema.safeParse({ avatar: 'agent-avatar-file:x.webp', name: 'Agent' }).success).toBe(
        false,
      );
    },
  );

  test('accepts the built-in Cherry avatar only at creation', () => {
    expect(CreateAgentSchema.parse({ avatar: '🍒', name: 'Cherry Agent' })).toMatchObject({
      avatar: '🍒',
    });
    expect(UpdateAgentSchema.safeParse({ avatar: '🍒' }).success).toBe(false);
    expect(
      CreateAgentSchema.safeParse({ avatar: 'file:///avatar.webp', name: 'Cherry Agent' }).success,
    ).toBe(false);
  });
});
