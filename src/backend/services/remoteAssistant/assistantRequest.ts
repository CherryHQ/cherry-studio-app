import type {
  AssistantMethod,
  AssistantParams,
  AssistantResult,
} from '@cherrystudio/remote-protocol/assistant';

export type AssistantRequest = <M extends AssistantMethod>(
  method: M,
  params: AssistantParams<M>,
  signal?: AbortSignal,
) => Promise<AssistantResult<M>>;
