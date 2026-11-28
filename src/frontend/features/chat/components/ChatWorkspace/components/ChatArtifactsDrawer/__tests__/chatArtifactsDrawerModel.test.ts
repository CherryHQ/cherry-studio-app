import type { MessageListItem } from '@/frontend/components/Message';
import type { DesktopDispatchResult } from '@/shared/data/types/desktopDispatchTool';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { withCherryMeta } from '@/shared/data/types/uiParts';

import { isRemoteDispatchActive, reconcileChatArtifactsDrawer } from '../chatArtifactsDrawerModel';

const result: DesktopDispatchResult = {
  status: 'dispatched',
  connectionId: 'pc',
  connectionName: 'Desktop',
  agentId: 'agent',
  agentName: 'Agent',
  workspace: { kind: 'system' },
  workspaceName: 'Default',
  title: 'Remote task',
  promptPreview: 'Prepare report',
  attachments: [],
  sessionId: 'remote',
};

function file(fileEntryId: string): CherryMessagePart {
  return withCherryMeta(
    { type: 'file', mediaType: 'application/pdf', url: 'file://report' },
    { fileEntryId },
  );
}

function dispatch(toolCallId: string, output: unknown): CherryMessagePart {
  return {
    type: 'dynamic-tool',
    toolName: 'desktop_dispatch_task',
    toolMetadata: { cherry: { tool: { type: 'builtin' } } },
    toolCallId,
    state: 'output-available',
    input: null,
    output,
  };
}

function message(
  id: string,
  role: MessageListItem['role'],
  parts: CherryMessagePart[],
): MessageListItem {
  return { id, role, status: 'pending', data: { parts } };
}

describe('reconcileChatArtifactsDrawer', () => {
  test('uses current live results first, then the rest of persisted resources with no duplicates', () => {
    const resources = reconcileChatArtifactsDrawer(
      {
        dispatches: [
          { messageId: 'saved', toolCallId: 'duplicate', input: null, output: result },
          {
            messageId: 'saved',
            toolCallId: 'old',
            input: null,
            output: { ...result, sessionId: 'archive' },
          },
        ],
        files: [{ fileEntryId: 'new' }, { fileEntryId: 'archive' }, { fileEntryId: 'old' }],
      },
      [
        message('history', 'assistant', [file('old'), dispatch('stale-result', result)]),
        message('user', 'user', [
          file('upload'),
          dispatch('user-dispatch', { ...result, sessionId: 'user-work' }),
        ]),
        message('live', 'assistant', [
          file('new'),
          dispatch('latest-result', { ...result, title: 'Updated title' }),
          file('new'),
          dispatch('other-desktop', { ...result, connectionId: 'other' }),
          dispatch('no-target', { ...result, sessionId: undefined }),
        ]),
      ],
    );
    expect(resources.remoteSessions.map(({ key, toolCallId }) => [key, toolCallId])).toEqual([
      ['session:other:remote', 'other-desktop'],
      ['session:pc:remote', 'latest-result'],
      ['session:pc:archive', 'old'],
    ]);
    expect(resources.remoteSessions[1].view.title).toBe('Updated title');
    expect(resources.fileEntryIds).toEqual(['new', 'old', 'archive']);
  });

  test('keeps distinct draft operations and excludes tool parts with no openable receipt', () => {
    const pending = {
      ...result,
      status: 'pending_confirmation',
      sessionId: undefined,
      draftId: 'draft',
    };
    const streaming: CherryMessagePart = {
      type: 'dynamic-tool',
      toolName: 'desktop_dispatch_task',
      toolCallId: 'streaming',
      state: 'input-streaming',
      input: { connectionId: 'pc' },
      toolMetadata: { cherry: { tool: { type: 'builtin' } } },
    };
    const lookalike: CherryMessagePart = {
      ...dispatch('external-tool', result),
      toolMetadata: { cherry: { tool: { type: 'mcp' } } },
    } as CherryMessagePart;
    expect(
      reconcileChatArtifactsDrawer(undefined, [
        message('live', 'assistant', [
          dispatch('op1', { ...pending, operationId: '1' }),
          dispatch('op2', { ...pending, operationId: '2' }),
          dispatch('op1-repeat', { ...pending, operationId: '1' }),
          streaming,
          lookalike,
        ]),
      ]).remoteSessions.map(({ toolCallId }) => toolCallId),
    ).toEqual(['op1-repeat', 'op2']);
    expect(reconcileChatArtifactsDrawer(undefined, [])).toEqual({
      remoteSessions: [],
      fileEntryIds: [],
    });
  });
});

test.each([
  ['running', true],
  ['awaiting-approval', true],
  ['pending-confirm', true],
  ['completed', false],
  ['failed', false],
  ['offline', false],
  ['dispatched', false],
] as const)('reports %s activity as %s', (state, active) => {
  expect(isRemoteDispatchActive(state)).toBe(active);
});
