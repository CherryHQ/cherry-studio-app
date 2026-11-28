import type { MessageListItem } from '@/frontend/components/Message';
import {
  buildDesktopTaskPipViewModel,
  isDesktopDispatchToolPart,
  isToolMessagePart,
  type DesktopTaskPipViewModel,
} from '@/frontend/components/Message/desktopTaskPip';
import type {
  AgentSessionResourceDispatch,
  AgentSessionResources,
} from '@/shared/data/api/schemas/agentSessionMessages';
import { readCherryMeta } from '@/shared/data/types/uiParts';
import { desktopTaskPipTargetKey } from '@/shared/utils/desktopTaskPipModel';

export type ChatArtifactsRemoteSession = AgentSessionResourceDispatch & {
  key: string;
  view: DesktopTaskPipViewModel;
};

export function isRemoteDispatchActive(state: DesktopTaskPipViewModel['state']) {
  return state === 'running' || state === 'awaiting-approval' || state === 'pending-confirm';
}

/** Live rows arrive in transcript order. The persisted resource lists are already newest-first. */
export function reconcileChatArtifactsDrawer(
  persisted: AgentSessionResources | undefined,
  messages: readonly MessageListItem[],
) {
  const remoteSessions = new Map<string, ChatArtifactsRemoteSession>();
  const fileEntryIds = new Set<string>();

  const addDispatch = (dispatch: AgentSessionResourceDispatch) => {
    const view = buildDesktopTaskPipViewModel(dispatch);
    const key = desktopTaskPipTargetKey(view);
    if (key && !remoteSessions.has(key)) remoteSessions.set(key, { ...dispatch, key, view });
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const parts = message.data.parts;
    if (message.role !== 'assistant' || !parts) continue;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part.type === 'file') {
        const id = readCherryMeta(part)?.fileEntryId;
        if (id) fileEntryIds.add(id);
      } else if (isToolMessagePart(part) && isDesktopDispatchToolPart(part)) {
        addDispatch({
          messageId: message.id,
          toolCallId: part.toolCallId,
          input: part.input,
          output: part.state === 'output-available' ? part.output : undefined,
        });
      }
    }
  }
  for (const dispatch of persisted?.dispatches ?? []) addDispatch(dispatch);
  for (const file of persisted?.files ?? []) fileEntryIds.add(file.fileEntryId);

  return { remoteSessions: [...remoteSessions.values()], fileEntryIds: [...fileEntryIds] };
}
