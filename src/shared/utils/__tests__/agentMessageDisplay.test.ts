import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';

import { projectAgentMessageDisplay } from '../agentMessageDisplay';

function message(parts: AgentMessagePart[]): AgentMessageView {
  return {
    id: 'answer',
    sessionId: 'session',
    turnId: 'turn',
    role: 'assistant',
    status: 'streaming',
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    modelId: null,
    stats: null,
    inferenceSnapshot: null,
    parts,
  };
}

function tool(
  overrides: Partial<Extract<AgentMessagePart, { type: 'dynamic-tool' }>> = {},
): AgentMessagePart {
  return {
    id: 'script',
    type: 'dynamic-tool',
    toolCallId: 'call',
    toolName: 'codemode',
    toolRef: { source: 'builtin', capabilityId: 'run_js' },
    title: 'Script',
    state: 'running',
    ...overrides,
  };
}

test('publishes adjacent reasoning as status only while keeping originals and ordinary replies', () => {
  const original = message([
    { id: 'empty', type: 'reasoning', text: '', state: 'done' },
    { id: 'first', type: 'reasoning', text: '前'.repeat(20_000), state: 'done' },
    { id: 'last', type: 'reasoning', text: '尾'.repeat(20_000), state: 'streaming' },
    { id: 'answer', type: 'text', text: '正文'.repeat(20_000), state: 'streaming' },
  ]);
  const view = projectAgentMessageDisplay(original);
  expect(view.parts).toHaveLength(2);
  expect(view.parts[0]).toEqual({
    id: 'first',
    type: 'reasoning',
    text: '',
    hasText: true,
    state: 'streaming',
  });
  expect(view.parts[1]).toBe(original.parts[3]);
  expect(original.parts[1]).toMatchObject({ text: '前'.repeat(20_000) });
  expect(projectAgentMessageDisplay(view)).toBe(view);
});

test.each(['Short thought', 'Long thought.\n'.repeat(3000)])(
  'never includes reasoning text in a list message',
  (text) => {
    const original = message([{ id: 'phase', type: 'reasoning', text, state: 'done' }]);
    expect(projectAgentMessageDisplay(original).parts).toEqual([
      { id: 'phase', type: 'reasoning', text: '', hasText: true, state: 'done' },
    ]);
    expect(original.parts[0]).toHaveProperty('text', text);
  },
);

test('keeps readable status-only history and empty streaming placeholders', () => {
  const saved = message([
    { id: 'phase', type: 'reasoning', text: '', hasText: true, state: 'done' },
  ]);
  expect(projectAgentMessageDisplay(saved)).toBe(saved);
  const empty = message([{ id: 'phase', type: 'reasoning', text: '', state: 'streaming' }]);
  expect(projectAgentMessageDisplay(empty).parts).toEqual([
    { id: 'phase', type: 'reasoning', text: '', hasText: false, state: 'streaming' },
  ]);
});

test('retains full script inputs, nested output and attachments without serializing them', () => {
  const toJSON = jest.fn(() => {
    throw new Error('Display projection must not serialize input');
  });
  const input = { code: 'x'.repeat(100_000) };
  Object.defineProperty(input, 'toJSON', { value: toJSON });
  const artifacts = [{ ref: { kind: 'managed-file', fileEntryId: 'file' }, name: 'report.xlsx' }];
  const source = tool({
    input,
    state: 'output-available',
    output: {
      value: { output: 'x'.repeat(100_000), details: { input }, logs: 'logs'.repeat(30_000) },
      modelValue: 'model text'.repeat(30_000),
      artifacts,
    },
  });
  const projected = projectAgentMessageDisplay(message([source])).parts[0];
  expect(projected).toBe(source);
  expect(projected).toMatchObject({
    input,
    output: {
      value: {
        output: 'x'.repeat(100_000),
        details: { input },
        logs: 'logs'.repeat(30_000),
      },
      modelValue: 'model text'.repeat(30_000),
      artifacts,
    },
  });
  expect(toJSON).not.toHaveBeenCalled();
  expect(source).toHaveProperty('input', input);
});

test('preserves full failed scripts, approval inputs and MCP results', () => {
  const input = { code: 'x'.repeat(100_000) };
  const awaiting = tool({ state: 'awaiting-approval', input, approvalId: 'approval' });
  const remote = tool({
    toolRef: { source: 'mcp', serverId: 'server', rawToolName: 'codemode' },
    input,
  });
  const failed = tool({
    state: 'error',
    input,
    error: { code: 'EXECUTION_FAILED', message: 'e'.repeat(10_000), retryable: false },
    output: { value: { error: { arguments: input } } },
  });
  const parts = projectAgentMessageDisplay(message([awaiting, remote, failed])).parts;
  expect(parts[0]).toBe(awaiting);
  expect(parts[1]).toBe(remote);
  expect(parts[2]).toBe(failed);
  expect(parts[2]).toHaveProperty('input', input);
  expect(parts[2]).toHaveProperty('output.value.error.arguments', input);
  expect(parts[2]).toHaveProperty('error.message', 'e'.repeat(10_000));
});
