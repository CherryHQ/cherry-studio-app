import type { Context } from '@earendil-works/chord';
import { defineDoc, defineEntry, type ToolExecutionApi } from '@earendil-works/pi-durable';

import type { RuntimeArtifact } from '../types';

/** Replay receipts belong to the parent task; committed artifact entries outlive cancellation. */
export const PiCodemodeFiles = defineDoc<{
  outputs: Record<string, RuntimeArtifact>;
  artifacts: RuntimeArtifact[];
}>({
  kind: 'cherry.codemode-files',
  version: 1,
  scope: 'task',
  checkpointWhen: () => false,
  initial: () => ({ outputs: {}, artifacts: [] }),
});

export const PiCodemodeArtifactsEntry = defineEntry<{
  callId: string;
  artifacts: RuntimeArtifact[];
}>('cherry.codemode-artifacts');

export async function retainPiCodemodeArtifacts(
  api: ToolExecutionApi,
  taskId: ToolExecutionApi['taskId'],
  callId: string,
  artifacts: readonly RuntimeArtifact[],
  context: Context,
) {
  if (!artifacts.length) return;
  await api.commit(async (tx) => {
    const files = await tx.doc(PiCodemodeFiles, taskId);
    const changed: RuntimeArtifact[] = [];
    for (const artifact of artifacts) {
      const index = files.artifacts.findIndex(
        (item) => item.ref.fileEntryId === artifact.ref.fileEntryId,
      );
      if (index >= 0 && JSON.stringify(files.artifacts[index]) === JSON.stringify(artifact))
        continue;
      if (index < 0) files.artifacts.push(artifact);
      else files.artifacts[index] = artifact;
      changed.push(artifact);
    }
    if (changed.length)
      await tx.appendEntry(PiCodemodeArtifactsEntry, api.conversationId, {
        data: { callId, artifacts: changed },
      });
  }, context);
}
