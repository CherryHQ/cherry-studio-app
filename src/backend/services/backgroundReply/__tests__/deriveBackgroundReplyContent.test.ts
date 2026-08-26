import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';

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

function toolPart(rawToolName: string): Extract<AgentMessagePart, { type: 'tool' }> {
  return {
    id: 'tool-1',
    input: {},
    state: 'running',
    toolCallId: 'call-1',
    toolRef:
      rawToolName === 'private_mcp_tool'
        ? { source: 'mcp', serverId: 'server-1', rawToolName }
        : { source: 'builtin', capabilityId: rawToolName },
    providerName: `provider_${rawToolName}`,
    displayName: rawToolName,
    type: 'tool',
  };
}

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
    const content = deriveBackgroundReplyContent(message([toolPart(toolName)]), t);

    expect(content).toEqual({ detail, phase: 'using-tool' });
  });

  test('prioritizes approval over text and keeps only the safe reply preview', () => {
    const content = deriveBackgroundReplyContent(
      message([
        { type: 'text', text: 'Partial **answer**' },
        {
          ...toolPart('private_mcp_tool'),
          approvalId: 'approval-1',
          input: { secret: 'not rendered' },
          state: 'awaiting-approval',
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

  test('derives tool and approval phases from Agent message parts', () => {
    const tool = toolPart('web_search');
    expect(deriveBackgroundReplyContent({ parts: [tool] }, t)).toEqual({
      detail: 'Searching the web',
      phase: 'using-tool',
    });
    expect(
      deriveBackgroundReplyContent(
        { parts: [{ ...tool, approvalId: 'approval-1', state: 'awaiting-approval' }] },
        t,
      ),
    ).toEqual({ detail: 'Awaiting approval', phase: 'awaiting-approval' });
  });

  test('truncates from the end without splitting unicode characters', () => {
    const preview = extractReplyPreview([
      {
        id: 'text-1',
        state: 'done',
        type: 'text',
        text: `${'a'.repeat(170)}😀末尾`,
      },
    ]);

    expect(Array.from(preview ?? '')).toHaveLength(160);
    expect(preview?.endsWith('😀末尾')).toBe(true);
    expect(preview?.startsWith('…')).toBe(true);
  });

  test('starts a long preview at the latest complete sentence when possible', () => {
    const preview = extractReplyPreview([
      {
        id: 'text-1',
        state: 'done',
        type: 'text',
        text: `${'较早内容'.repeat(50)}。最近的完整句子保留用于实时活动预览。最后的结论也应该保持完整。`,
      },
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

function message(parts: unknown[]): Pick<AgentMessageView, 'parts'> {
  return { parts } as Pick<AgentMessageView, 'parts'>;
}
