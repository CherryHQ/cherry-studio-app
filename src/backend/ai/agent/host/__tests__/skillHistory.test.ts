import { AgentInputPartSchema, AgentMessagePartSchema } from '@/shared/contracts/agent';

import { isSkillActivationCurrent } from '../skillHistory';
import { EMPTY_SKILL_SCOPE } from '../skillScope';

const activation = {
  skillId: '00000000-0000-4000-8000-000000000123',
  name: 'notes',
  contentHash: 'accepted',
  origin: 'automatic' as const,
};
test('an activation outside the current Skill scope is not current', () => {
  expect(isSkillActivationCurrent(activation, EMPTY_SKILL_SCOPE)).toBe(false);
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
