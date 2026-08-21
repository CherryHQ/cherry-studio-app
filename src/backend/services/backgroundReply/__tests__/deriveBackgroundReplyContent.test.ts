import type { CherryMessagePart, CherryUIMessage } from '@/shared/data/types/message';

import {
  deriveBackgroundReplyContent,
  extractReplyPreview,
  getTerminalBackgroundReplyContent,
} from '../deriveBackgroundReplyContent';

const translations: Record<string, string> = {
  'chat.backgroundReply.awaitingApproval': 'Awaiting approval',
  'chat.backgroundReply.cancelled': 'Cancelled',
  'chat.backgroundReply.completed': 'Completed',
  'chat.backgroundReply.failed': 'Failed',
  'chat.backgroundReply.preparing': 'Preparing',
  'chat.backgroundReply.responding': 'Replying',
  'chat.backgroundReply.thinking': 'Thinking',
  'chat.backgroundReply.tool.generic': 'Using a tool',
  'chat.backgroundReply.tool.webSearch': 'Searching the web',
  'chat.builtinTool.calendar.listEvents': 'Find calendar events',
};
const t = (key: string) => translations[key] ?? key;

describe('deriveBackgroundReplyContent', () => {
  test('moves from preparing through thinking to responding', () => {
    expect(deriveBackgroundReplyContent(undefined, t)).toEqual({
      detail: 'Preparing',
      phase: 'preparing',
    });
    expect(deriveBackgroundReplyContent(message([{ type: 'reasoning', text: 'work' }]), t)).toEqual(
      {
        detail: 'Thinking',
        phase: 'thinking',
      },
    );
    expect(
      deriveBackgroundReplyContent(
        message([{ type: 'text', text: '**Answer** with [source](url)' }]),
        t,
      ),
    ).toEqual({
      detail: 'Replying',
      phase: 'responding',
      preview: 'Answer with source',
    });
  });

  test.each([
    ['web_search', 'Searching the web'],
    ['calendar_list_events', 'Find calendar events'],
    ['private_mcp_tool', 'Using a tool'],
  ])('maps active tool %s to a safe label', (toolName, detail) => {
    const content = deriveBackgroundReplyContent(
      message([
        {
          input: {},
          state: 'input-available',
          toolCallId: 'call-1',
          toolName,
          type: 'dynamic-tool',
        },
      ]),
      t,
    );

    expect(content).toEqual({ detail, phase: 'using-tool' });
  });

  test('prioritizes approval over text and keeps only the safe reply preview', () => {
    const content = deriveBackgroundReplyContent(
      message([
        { type: 'text', text: 'Partial **answer**' },
        {
          approval: { id: 'approval-1' },
          input: { secret: 'not rendered' },
          state: 'approval-requested',
          toolCallId: 'call-1',
          toolName: 'private_tool',
          type: 'dynamic-tool',
        },
      ]),
      t,
    );

    expect(content).toEqual({
      detail: 'Awaiting approval',
      phase: 'awaiting-approval',
      preview: 'Partial answer',
    });
  });

  test('truncates from the end without splitting unicode characters', () => {
    const preview = extractReplyPreview([
      { type: 'text', text: `${'a'.repeat(170)}😀末尾` } as CherryMessagePart,
    ]);

    expect(Array.from(preview ?? '')).toHaveLength(160);
    expect(preview?.endsWith('😀末尾')).toBe(true);
    expect(preview?.startsWith('…')).toBe(true);
  });

  test('starts a long preview at the latest complete sentence when possible', () => {
    const preview = extractReplyPreview([
      {
        type: 'text',
        text: `${'较早内容'.repeat(50)}。最近的完整句子保留用于实时活动预览。最后的结论也应该保持完整。`,
      } as CherryMessagePart,
    ]);

    expect(preview).toBe('最近的完整句子保留用于实时活动预览。最后的结论也应该保持完整。');
  });

  test('keeps preview only for completed terminal content', () => {
    expect(getTerminalBackgroundReplyContent('completed', 'final answer', t)).toEqual({
      detail: 'Completed',
      phase: 'completed',
      preview: 'final answer',
    });
    expect(getTerminalBackgroundReplyContent('failed', 'partial answer', t)).toEqual({
      detail: 'Failed',
      phase: 'failed',
    });
    expect(getTerminalBackgroundReplyContent('cancelled', 'partial answer', t)).toEqual({
      detail: 'Cancelled',
      phase: 'cancelled',
    });
  });
});

function message(parts: unknown[]): CherryUIMessage {
  return { id: 'assistant-1', parts, role: 'assistant' } as CherryUIMessage;
}
