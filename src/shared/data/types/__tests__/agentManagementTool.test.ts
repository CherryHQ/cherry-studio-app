import { AgentMutationToolResultSchema, AgentToolRecordSchema } from '../agentManagementTool';

const agent = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Writer',
  instructions: 'Write clearly.',
  mode: 'standard',
  model: 'provider::model',
  modelName: 'Model',
  disabledCapabilities: [],
  toolApprovalMode: 'auto',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

test('reads historical tool results without a mode as standard', () => {
  const { mode: _mode, ...historical } = agent;
  expect(AgentToolRecordSchema.parse(historical)).toEqual(agent);
});

test('emits model and reads historical mutation results without rewriting their payloads', () => {
  expect(AgentToolRecordSchema.parse(JSON.parse(JSON.stringify(agent)))).toEqual(agent);
  const { model, ...fields } = agent;
  const historical = { status: 'created', agent: { ...fields, modelId: model } };
  const stored = JSON.stringify(historical);
  expect(AgentMutationToolResultSchema.parse(historical)).toEqual({ status: 'created', agent });
  expect(JSON.stringify(historical)).toBe(stored);
  expect(AgentToolRecordSchema.safeParse(historical.agent).success).toBe(false);
});

test('keeps a cleared model in current and historical mutation results', () => {
  const { model: _model, ...fields } = agent;
  for (const assignment of [{ model: null }, { modelId: null }]) {
    expect(
      AgentMutationToolResultSchema.parse({
        status: 'updated',
        agent: { ...fields, ...assignment },
      }),
    ).toEqual({ status: 'updated', agent: { ...fields, model: null } });
  }
});
