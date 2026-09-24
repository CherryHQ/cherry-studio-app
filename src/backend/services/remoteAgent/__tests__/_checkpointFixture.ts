import {
  encodeAgentCheckpointPage,
  type AgentCheckpointPage,
  type AgentProjection,
} from '@cherrystudio/remote-protocol/agent';

import { integrity } from '../remoteContent';

export function createCheckpointFixture(projection: AgentProjection) {
  const page: AgentCheckpointPage = {
    checkpointId: 'checkpoint',
    pageIndex: 0,
    items: [
      { kind: 'session', value: projection.session },
      ...Object.values(projection.executions).map((value) => ({
        kind: 'execution' as const,
        value,
      })),
      ...Object.values(projection.messages).flatMap((value): AgentCheckpointPage['items'] => [
        { kind: 'message' as const, value },
        ...value.partIds.map((id) => ({
          kind: 'part' as const,
          messageId: value.messageId,
          value: projection.parts[id],
        })),
      ]),
      ...Object.values(projection.interactions).map((value) => ({
        kind: 'interaction' as const,
        value,
      })),
    ],
    nextCursor: null,
    pageDigest: '0'.repeat(64),
  };
  const bytes = encodeAgentCheckpointPage(page);
  page.pageDigest = integrity.sha256(bytes);
  return {
    page,
    descriptor: {
      checkpointId: page.checkpointId,
      cursor: projection.cursor,
      historyRevision: projection.session.historyRevision,
      pageCount: 1,
      byteLength: String(bytes.length),
      sha256: integrity.sha256(bytes),
      expiresAt: '2026-09-22T00:10:00.000Z',
    },
  };
}
