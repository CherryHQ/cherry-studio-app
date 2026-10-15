import {
  encodeAssistantCheckpointPage,
  type AssistantProjection,
  type AssistantCheckpointPage,
  type AssistantCheckpointItem,
} from '@cherrystudio/remote-protocol/assistant';

import { integrity } from '@/backend/services/remoteConversation';

export const projection = (): AssistantProjection => ({
  cursor: { topicId: 'topic', streamEpoch: 'epoch', seq: '0' },
  topic: {
    topicId: 'topic',
    assistantId: 'assistant',
    title: 'Topic',
    updatedAt: '2026-10-14T00:00:00.000Z',
    historyRevision: '0',
    parentAnchorId: null,
    activeExecutionIds: [],
  },
  messages: {},
  parts: {},
  executions: {},
  interactions: {},
});
export function checkpoint(state: AssistantProjection) {
  const items: AssistantCheckpointItem[] = [{ kind: 'topic', value: state.topic }];
  for (const message of Object.values(state.messages)) {
    items.push({ kind: 'message', value: message });
    for (const id of message.partIds)
      items.push({ kind: 'part', messageId: message.messageId, value: state.parts[id] });
  }
  for (const execution of Object.values(state.executions))
    items.push({ kind: 'execution', value: execution });
  for (const interaction of Object.values(state.interactions))
    items.push({ kind: 'interaction', value: interaction });
  const page: AssistantCheckpointPage = {
    checkpointId: 'checkpoint',
    pageIndex: 0,
    items,
    nextCursor: null,
    pageDigest: '0'.repeat(64),
  };
  const bytes = encodeAssistantCheckpointPage(page);
  page.pageDigest = integrity.sha256(bytes);
  return {
    page,
    descriptor: {
      checkpointId: 'checkpoint',
      cursor: state.cursor,
      historyRevision: state.topic.historyRevision,
      pageCount: 1,
      byteLength: String(bytes.length),
      sha256: integrity.sha256(bytes),
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  };
}
