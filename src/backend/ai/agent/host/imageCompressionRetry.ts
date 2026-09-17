import { classifyAiFailureReason } from '@/shared/utils/aiFailure';

import type { ManagedFileResolver, TurnResourceLedger } from '../resources/managedFileResolver';
import type { AgentRuntimeSession, RuntimeEvent, RuntimeExecutionRequest } from '../runtime';
import type { RuntimeAttachmentContents } from './turnRuntimeInput';

/** Retry one rejected request, before any output, usage, or tool execution can be replayed. */
export async function* executeWithImageCompressionRetry(input: {
  session: Pick<AgentRuntimeSession, 'execute'>;
  request: RuntimeExecutionRequest;
  prepareRetry: () => Promise<RuntimeExecutionRequest | undefined>;
  signal: AbortSignal;
}): AsyncIterable<RuntimeEvent> {
  let canRetry = true;
  for await (const event of input.session.execute(input.request)) {
    input.signal.throwIfAborted();
    if (
      canRetry &&
      event.type === 'failed' &&
      classifyAiFailureReason({ ...event.error, ...event.error.context }) === 'payload_too_large'
    ) {
      let retry: RuntimeExecutionRequest | undefined;
      try {
        retry = await input.prepareRetry();
      } catch {
        // Keep the provider's useful size error if image preparation itself fails.
        input.signal.throwIfAborted();
      }
      input.signal.throwIfAborted();
      if (retry) {
        yield* input.session.execute(retry);
        return;
      }
    }
    canRetry = false;
    yield event;
  }
}

/** Replace only images actually included in the request; stored file facts remain canonical. */
export async function compressRuntimeImages(
  files: ManagedFileResolver,
  resources: TurnResourceLedger,
  attachments: RuntimeAttachmentContents,
  signal: AbortSignal,
): Promise<RuntimeAttachmentContents | undefined> {
  const compressed = new Map(attachments);
  let changed = false;
  for (const [id, attachment] of attachments) {
    signal.throwIfAborted();
    if (attachment.type !== 'file') continue;
    const fact = resources.availableFiles.get(id);
    if (!fact) continue;
    const uri = await files.readAsDataUrl(fact, signal, { compress: true });
    signal.throwIfAborted();
    if (
      uri &&
      uri.startsWith(`data:${attachment.mediaType};base64,`) &&
      uri.length < attachment.uri.length
    ) {
      compressed.set(id, { ...attachment, uri });
      changed = true;
    }
  }
  return changed ? compressed : undefined;
}
