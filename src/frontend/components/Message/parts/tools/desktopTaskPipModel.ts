import type {
  RemoteDispatchReceipt,
  RemoteSessionLivePreview,
} from '@/shared/contracts/remoteAgent';
import {
  DesktopDispatchApprovalInputSchema,
  DesktopDispatchResultSchema,
  type DesktopDispatchResult,
} from '@/shared/data/types/desktopDispatchTool';

import { isRecord } from './toolPartState';

export type DesktopTaskPipViewModel = {
  state:
    | 'running'
    | 'awaiting-approval'
    | 'completed'
    | 'failed'
    | 'offline'
    | 'pending-confirm'
    | 'dispatched';
  title?: string;
  connectionId?: string;
  connectionName?: string;
  agentId?: string;
  agentName?: string;
  workspaceKind?: 'registered' | 'system';
  workspaceName?: string;
  sessionId?: string;
  draftId?: string;
  operationId?: string;
  attachmentCount: number;
  recentTools: RemoteSessionLivePreview['recentTools'];
  pendingApprovalTitle?: string;
  previewText?: string;
  canOpenModal: boolean;
};

function resolveState(
  status: DesktopDispatchResult['status'] | undefined,
  live?: RemoteSessionLivePreview,
): DesktopTaskPipViewModel['state'] {
  if (
    live?.connectionStatus === 'offline' ||
    live?.connectionStatus === 'suspended' ||
    status === 'desktop_offline'
  )
    return 'offline';
  if (status === 'rejected') return 'failed';
  if (live?.pendingInteraction) return 'awaiting-approval';
  switch (live?.executionState) {
    case 'awaiting-approval':
      return 'awaiting-approval';
    case 'pending-confirm':
      return 'pending-confirm';
    case 'running':
    case 'finalizing':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
    case 'interrupted':
      return 'failed';
  }
  if (status === 'pending_confirmation') return 'pending-confirm';
  return status === 'dispatched' ? 'dispatched' : 'running';
}

function nonBlankText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function buildDesktopTaskPipViewModel({
  input,
  output,
  livePreview,
  recoveredDispatch,
}: {
  input?: unknown;
  output?: unknown;
  livePreview?: RemoteSessionLivePreview;
  recoveredDispatch?: RemoteDispatchReceipt;
}): DesktopTaskPipViewModel {
  const result = DesktopDispatchResultSchema.safeParse(output).data;
  const approval = DesktopDispatchApprovalInputSchema.safeParse(input).data;
  const dispatch = result ?? approval;
  // Streaming tool arguments may still have their wire names or incomplete fields.
  const loose = isRecord(input) ? input : {};
  const workspace = isRecord(loose.workspace) ? loose.workspace : {};
  const connectionId =
    dispatch?.connectionId ?? nonBlankText(loose.connectionId ?? loose.connection_id);
  const sessionId = result?.sessionId ?? recoveredDispatch?.sessionId;
  const recoveredStatus = recoveredDispatch?.status;
  const status =
    recoveredStatus === 'applied'
      ? 'dispatched'
      : recoveredStatus === 'rejected' || recoveredStatus === 'interrupted'
        ? 'rejected'
        : (result?.status ?? (output !== undefined ? 'rejected' : undefined));
  const looseAttachments = loose.attachments ?? loose.file_entry_ids;
  const brief = approval?.text ?? nonBlankText(loose.text);

  return {
    state: resolveState(status, livePreview),
    title: nonBlankText(livePreview?.sessionTitle) ?? dispatch?.title ?? nonBlankText(loose.title),
    connectionId,
    connectionName: dispatch?.connectionName ?? nonBlankText(loose.connectionName),
    agentId: dispatch?.agentId ?? nonBlankText(loose.agentId ?? loose.agent_id),
    agentName: dispatch?.agentName ?? nonBlankText(loose.agentName),
    workspaceKind:
      dispatch?.workspace.kind ??
      (workspace.kind === 'system' || workspace.kind === 'registered' ? workspace.kind : undefined),
    workspaceName: dispatch?.workspaceName ?? nonBlankText(loose.workspaceName ?? workspace.name),
    sessionId,
    draftId: result?.draftId,
    operationId: result?.operationId,
    attachmentCount:
      dispatch?.attachments.length ??
      (Array.isArray(looseAttachments) ? looseAttachments.length : 0),
    recentTools: livePreview?.recentTools ?? [],
    pendingApprovalTitle: nonBlankText(livePreview?.pendingInteraction?.title),
    previewText:
      nonBlankText(livePreview?.previewText) ??
      nonBlankText(result?.promptPreview) ??
      brief?.slice(0, 240),
    canOpenModal: Boolean(
      connectionId && (sessionId || (result?.draftId && result.status === 'pending_confirmation')),
    ),
  };
}
