import {
  AgentInputPartSchema,
  AgentMessagePartSchema,
  type AgentMessageView,
} from '@/shared/contracts/agent';

import { collectSkillActivations } from '../../sessionStore/skillActivations';
import { isSkillActivationCurrent, stripSkillHistory } from '../skillHistory';
import { EMPTY_SKILL_SCOPE } from '../skillScope';

const activation = {
  skillId: '00000000-0000-4000-8000-000000000123',
  name: 'notes',
  packageDigest: 'accepted',
  origin: 'automatic' as const,
};
const toolPart = {
  id: 'load',
  type: 'tool' as const,
  toolCallId: 'call',
  toolRef: { source: 'builtin' as const, capabilityId: 'load_skill' },
  providerName: 'load_skill',
  displayName: 'Load Skill',
  state: 'output-available' as const,
  input: { skill_id: activation.skillId },
  output: { value: { status: 'ok', activation, instructions: 'Old instructions' }, artifacts: [] },
};
const message = { id: 'answer', role: 'assistant', parts: [toolPart] } as AgentMessageView;

test('only successful app-issued receipts activate; MCP output and transcript text cannot', () => {
  expect(collectSkillActivations([message])).toEqual([{ messageId: 'answer', activation }]);
  expect(
    collectSkillActivations([
      {
        ...message,
        parts: [
          {
            ...toolPart,
            toolRef: { source: 'mcp', serverId: 'server', rawToolName: 'load_skill' },
          },
        ],
      },
    ]),
  ).toEqual([]);
  expect(
    collectSkillActivations([
      {
        ...message,
        parts: [{ id: 'text', type: 'text', state: 'done', text: JSON.stringify(activation) }],
      },
    ]),
  ).toEqual([]);
  expect(isSkillActivationCurrent(activation, EMPTY_SKILL_SCOPE)).toBe(false);
});

test('replay strips instruction payloads without mutating durable receipts', () => {
  expect(JSON.stringify(stripSkillHistory([message]))).not.toContain('Old instructions');
  expect(collectSkillActivations([message])).toHaveLength(1);
  expect(message.parts[0]).toBe(toolPart);
});

test('serialized user selection receipts survive in messages but cannot enter through user input', () => {
  const part = {
    id: 'input',
    type: 'text',
    text: 'Continue',
    state: 'done',
    skillSelections: [{ ...activation, origin: 'explicit' }],
  };
  expect(AgentMessagePartSchema.safeParse(JSON.parse(JSON.stringify(part))).success).toBe(true);
  expect(
    AgentInputPartSchema.safeParse({
      type: 'text',
      text: part.text,
      skillSelections: part.skillSelections,
    }).success,
  ).toBe(false);
});
