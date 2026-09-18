import type { ControllerDetail, ControllerMessage } from '@/shared/contracts/agent/controller';

import { presentRemoteMessage, withRemoteToolSummaries } from '../remoteMessagePresentation';

const message: ControllerMessage = {
  id: 'reply',
  role: 'assistant',
  status: 'success',
  detailsAvailable: true,
  truncated: false,
  parts: [
    { id: 'reply:0', type: 'reasoning', text: 'Plan', truncated: false },
    { id: 'reply:2', type: 'text', text: 'Found the file', truncated: false },
    { id: 'reply:4', type: 'text', text: 'Final answer', truncated: false },
  ],
};
const details: ControllerDetail[] = [
  { id: 'reply:0', type: 'reasoning', fields: [] },
  {
    id: 'reply:1',
    type: 'tool',
    name: 'read_file',
    state: 'output-available',
    fields: [
      { name: 'input', resource: 'input-ref' },
      { name: 'output', resource: 'output-ref' },
    ],
  },
  { id: 'reply:2', type: 'text', fields: [] },
  { id: 'reply:3', type: 'tool', name: 'edit_file', state: 'output-error', fields: [] },
  { id: 'reply:4', type: 'text', fields: [] },
];

it('places tools between the original process parts and the final answer', () => {
  const original = presentRemoteMessage(message);
  const result = withRemoteToolSummaries(original, details);
  expect(result.data.partKeys).toEqual(['reply:0', 'reply:1', 'reply:2', 'reply:3', 'reply:4']);
  expect(result.data.parts?.map((part) => part.type)).toEqual([
    'reasoning',
    'dynamic-tool',
    'text',
    'dynamic-tool',
    'text',
  ]);
  expect(result.data.parts?.[4]).toBe(original.data.parts?.[2]);
  expect(result.data.parts?.[1]).toMatchObject({
    toolCallId: 'reply:1',
    state: 'output-available',
  });
  expect(result.data.parts?.[3]).toMatchObject({ state: 'output-error' });
  // Resource references and detail values are never injected into the shared transcript.
  expect(JSON.stringify(result.data)).not.toContain('input-ref');
  expect(JSON.stringify(result.data)).not.toContain('output-ref');
  expect(original.data.parts).toHaveLength(3);
});

it('keeps newly streamed text after the last known tool while its directory is catching up', () => {
  const original = presentRemoteMessage({ ...message, status: 'streaming' });
  const result = withRemoteToolSummaries(original, [
    details[0],
    { ...details[1], state: 'input-streaming', fields: [] },
  ]);
  expect(result.data.partKeys).toEqual(['reply:0', 'reply:1', 'reply:2', 'reply:4']);
  expect(result.data.parts?.[1]).toMatchObject({ state: 'input-streaming' });
  expect(withRemoteToolSummaries(original, [])).toBe(original);
});

it.each(['approval-requested', 'output-denied'] as const)(
  'preserves %s in the lightweight projection so collapsed groups expose it',
  (state) => {
    const original = presentRemoteMessage({ ...message, status: 'streaming' });
    const result = withRemoteToolSummaries(original, [
      {
        id: 'tool-id',
        type: 'tool',
        name: 'Bash',
        state,
        fields: [{ name: 'input', resource: 'private-arguments' }],
      },
    ]);
    expect(result.data.parts?.find((part) => part.type === 'dynamic-tool')).toMatchObject({
      state,
    });
    expect(JSON.stringify(result.data)).not.toContain('private-arguments');
  },
);
