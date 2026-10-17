import type {
  AgentMethod,
  AgentParams,
  AgentResult,
  ContentRef,
} from '@cherrystudio/remote-protocol/agent';

import { readContentBytes } from '../remoteConversation';
export { integrity, decodeContent } from '../remoteConversation';
export type AgentRequest = <M extends AgentMethod>(
  method: M,
  params: AgentParams<M>,
  signal?: AbortSignal,
) => Promise<AgentResult<M>>;
export function readContent(
  request: AgentRequest,
  sessionId: string,
  ref: ContentRef,
  signal?: AbortSignal,
) {
  return readContentBytes(
    ref,
    (offset, caller) =>
      request(
        'agent.content.read',
        { sessionId, contentId: ref.contentId, revision: ref.revision, offset, maxBytes: 24_576 },
        caller,
      ),
    signal,
  );
}
