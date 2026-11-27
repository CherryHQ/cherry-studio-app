import type { RemoteSessionLivePreview } from '@/shared/contracts/remoteAgent';
import type { DesktopDispatchResult } from '@/shared/data/types/desktopDispatchTool';

import { buildDesktopTaskPipViewModel } from '../desktopTaskPipModel';

const output: DesktopDispatchResult = {
  status: 'dispatched',
  connectionId: 'desktop-1',
  connectionName: 'Studio Desktop',
  agentId: 'agent-1',
  agentName: 'Research',
  workspace: { kind: 'registered', id: 'reports', name: 'Reports' },
  workspaceName: 'Reports',
  title: 'Summarize the report',
  promptPreview: 'Summarize findings',
  sessionId: 'session-1',
  attachments: [
    {
      fileEntryId: '00000000-0000-7000-8000-000000000001',
      name: 'report.pdf',
      mediaType: 'application/pdf',
    },
  ],
};

function live(fields: Partial<RemoteSessionLivePreview>): RemoteSessionLivePreview {
  return { connectionStatus: 'ready', current: true, recentTools: [], ...fields };
}

describe('buildDesktopTaskPipViewModel', () => {
  test.each([
    ['dispatched', 'dispatched'],
    ['pending_confirmation', 'pending-confirm'],
    ['desktop_offline', 'offline'],
    ['rejected', 'failed'],
  ])('maps persisted dispatch %s to %s', (status, state) => {
    expect(buildDesktopTaskPipViewModel({ output: { ...output, status } }).state).toBe(state);
  });

  test.each([
    ['running', 'running'],
    ['finalizing', 'running'],
    ['pending-confirm', 'pending-confirm'],
    ['awaiting-approval', 'awaiting-approval'],
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['cancelled', 'failed'],
    ['interrupted', 'failed'],
  ] as const)('uses live execution %s ahead of a pending receipt', (executionState, state) => {
    const view = buildDesktopTaskPipViewModel({
      output: { ...output, status: 'pending_confirmation' },
      livePreview: live({ executionState }),
    });
    expect(view.state).toBe(state);
  });

  test.each(['offline', 'suspended'] as const)(
    'uses live connection %s ahead of active execution',
    (connectionStatus) => {
      const view = buildDesktopTaskPipViewModel({
        output,
        livePreview: live({ connectionStatus, executionState: 'running' }),
      });
      expect(view.state).toBe('offline');
    },
  );

  test('keeps a persisted offline or rejected outcome ahead of live activity', () => {
    const livePreview = live({ executionState: 'running' });
    expect(
      buildDesktopTaskPipViewModel({
        output: { ...output, status: 'desktop_offline' },
        livePreview,
      }).state,
    ).toBe('offline');
    expect(
      buildDesktopTaskPipViewModel({ output: { ...output, status: 'rejected' }, livePreview })
        .state,
    ).toBe('failed');
  });

  test('shows the latest pending interaction, tools and preview while retaining the persisted destination', () => {
    const recentTools = [
      { name: 'read_file', state: 'completed' },
      { name: 'run_task', state: 'input-ready' },
    ] as const;
    const view = buildDesktopTaskPipViewModel({
      input: { connection_id: 'wrong-desktop', title: 'Previous draft' },
      output: { ...output, errorMessage: 'Older error' },
      livePreview: live({
        executionState: 'running',
        pendingInteraction: { id: 'approval-1', title: 'Run project checks', kind: 'decision' },
        sessionTitle: 'Updated desktop title',
        previewText: 'I checked the report.',
        recentTools,
      }),
    });
    expect(view).toMatchObject({
      state: 'awaiting-approval',
      title: 'Updated desktop title',
      connectionId: output.connectionId,
      connectionName: output.connectionName,
      agentId: output.agentId,
      agentName: output.agentName,
      workspaceKind: 'registered',
      workspaceName: output.workspaceName,
      sessionId: output.sessionId,
      attachmentCount: 1,
      recentTools,
      pendingApprovalTitle: 'Run project checks',
      previewText: 'I checked the report.',
      canOpenModal: true,
    });
  });

  test('uses the brief instead of raw diagnostics and opens a pending receipt by draft alone', () => {
    const receipt = { ...output, sessionId: undefined };
    expect(buildDesktopTaskPipViewModel({ output: receipt })).toMatchObject({
      previewText: output.promptPreview,
      canOpenModal: false,
    });
    expect(
      buildDesktopTaskPipViewModel({
        output: { ...receipt, status: 'rejected', errorMessage: 'Desktop declined the task' },
        livePreview: live({ previewText: '  ' }),
      }),
    ).toMatchObject({ state: 'failed', previewText: output.promptPreview, canOpenModal: false });
    expect(
      buildDesktopTaskPipViewModel({
        output: { ...receipt, status: 'pending_confirmation', draftId: 'draft-1' },
      }),
    ).toMatchObject({ state: 'pending-confirm', draftId: 'draft-1', canOpenModal: true });
  });

  test('uses approved input or partial tool arguments for metadata before a receipt exists', () => {
    expect(
      buildDesktopTaskPipViewModel({
        input: {
          ...output,
          workspace: { kind: 'system' },
          workspaceName: 'System default',
          text: 'Full task brief',
          textCharLength: 15,
        },
      }),
    ).toMatchObject({
      workspaceKind: 'system',
      previewText: 'Full task brief',
      attachmentCount: 1,
      canOpenModal: false,
    });
    expect(
      buildDesktopTaskPipViewModel({
        input: {
          connection_id: 'pc',
          agent_id: 'agent',
          title: 'Work in progress',
          file_entry_ids: ['file'],
          workspace: { kind: 'registered', name: 'Reports' },
        },
      }),
    ).toMatchObject({
      connectionId: 'pc',
      agentId: 'agent',
      title: 'Work in progress',
      workspaceKind: 'registered',
      workspaceName: 'Reports',
      attachmentCount: 1,
      canOpenModal: false,
    });
  });

  test('shows an unrecognized result as a closed failure', () => {
    expect(
      buildDesktopTaskPipViewModel({
        input: { connection_id: 'pc', title: 'Dispatch task' },
        output: { status: 'error', error: 'INVALID_INPUT' },
      }),
    ).toMatchObject({ state: 'failed', title: 'Dispatch task', canOpenModal: false });
  });
});
