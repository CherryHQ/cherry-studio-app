import type { AgentMessagePart } from '@/shared/contracts/agent';

import {
  toAgentMessageView,
  toReadableAgentMessageViews,
  type AgentMessageViewRow,
} from '../agentSessionRows';

const quote = {
  id: 'q',
  sourceMessageId: '00000000-0000-7000-8000-000000000001',
  text: 'Snapshot',
};
const carrier = {
  id: 'text',
  type: 'text',
  state: 'done',
  text: 'Question',
  quotes: [quote],
  quoteAuthor: { role: 'assistant' },
};
const readable: AgentMessagePart = {
  id: 'other',
  type: 'text',
  text: 'Readable unrelated text',
  state: 'done',
};
function row(parts: unknown[], role = 'user'): AgentMessageViewRow {
  return {
    id: 'u',
    sessionId: 's',
    parentId: null,
    siblingsGroupId: 0,
    turnId: 't',
    role,
    status: 'success',
    data: { parts },
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: 1,
    updatedAt: 1,
  } as AgentMessageViewRow;
}
test.each([
  row([carrier, { ...carrier, id: 'second' }, readable]),
  row([carrier, readable], 'assistant'),
  row([carrier, readable], 'system'),
  row([readable, carrier]),
  row([{ ...carrier, type: 'reasoning' }, readable]),
])(
  'strict replay rejects contextual corruption while display isolates all offending carriers %#',
  (value) => {
    const before = JSON.stringify(value);
    expect(() => toAgentMessageView(value)).toThrow();
    const display = toReadableAgentMessageViews([value]);
    expect(display).toHaveLength(1);
    expect(display[0].parts.filter((part) => part.type === 'text')).toEqual([readable]);
    expect(display[0].parts.filter((part) => part.type === 'data-error')).toHaveLength(
      value.data.parts.length - 1,
    );
    expect(JSON.stringify(value)).toBe(before);
  },
);
test('old rows and complete quoted rows remain readable without recovery', () => {
  expect(toAgentMessageView(row([readable])).parts).toEqual([readable]);
  expect(toAgentMessageView(row([carrier])).parts).toEqual([carrier]);
});
