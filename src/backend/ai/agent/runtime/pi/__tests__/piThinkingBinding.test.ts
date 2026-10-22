import {
  addThinkingBindingHeader,
  applyThinkingBinding,
  supportsThinkingBinding,
} from '../piThinkingBinding';

test('binds supported Anthropic models without enabling beta controls for older or other models', () => {
  expect(supportsThinkingBinding('anthropic/claude-haiku-5.5')).toBe(true);
  expect(supportsThinkingBinding('claude-sonnet-5-5')).toBe(true);
  expect(supportsThinkingBinding('claude-sonnet-4-6')).toBe(false);
  expect(supportsThinkingBinding('gpt-5.5')).toBe(false);
});

test('preserves existing beta features without duplicate case-insensitive headers', () => {
  const headers = { 'Anthropic-Beta': 'existing-feature' } as Record<string, string>;
  addThinkingBindingHeader(headers);
  addThinkingBindingHeader(headers);
  expect(headers).toEqual({
    'anthropic-beta': 'existing-feature,thinking-binding-controls-2026-08-01',
  });
});

test('adaptive thinking drops invalid bindings server-side and preserves signed history', () => {
  const messages = [
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'reason', signature: 'signed' },
        { type: 'tool_use', id: 'call' },
      ],
    },
  ];
  const input = { thinking: { type: 'adaptive' }, messages };
  expect(applyThinkingBinding(input)).toEqual({
    ...input,
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
  });
  expect(input.thinking).toEqual({ type: 'adaptive' });
});

test('nonadaptive replay omits thinking but preserves tool use and results', () => {
  const input = {
    thinking: { type: 'disabled' },
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'reason', signature: 'signed' },
          { type: 'tool_use', id: 'call' },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call' }] },
    ],
  };
  expect(applyThinkingBinding(input)).toEqual({
    ...input,
    messages: [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call' }] },
      input.messages[1],
    ],
  });
  expect(input.messages[0]!.content).toHaveLength(2);
});
