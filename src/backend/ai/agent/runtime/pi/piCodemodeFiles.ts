import type { Context } from '@earendil-works/chord';
import { defineDoc, type HookApi, type ToolExecutionApi } from '@earendil-works/pi-durable';

import type { RuntimeArtifact } from '../types';

/** Output receipts belong to the parent task and disappear after its result is committed. */
export const PiCodemodeFiles = defineDoc<{
  outputs: Record<string, RuntimeArtifact>;
  artifacts: RuntimeArtifact[];
}>({
  kind: 'cherry.codemode-files',
  version: 1,
  scope: 'task',
  initial: () => ({ outputs: {}, artifacts: [] }),
});

export async function retainPiCodemodeArtifacts(
  api: HookApi | ToolExecutionApi,
  taskId: HookApi['taskId'],
  artifacts: readonly RuntimeArtifact[],
  context: Context,
) {
  if (!artifacts.length) return;
  await api.commit(async (tx) => {
    const files = await tx.doc(PiCodemodeFiles, taskId);
    for (const artifact of artifacts) {
      const index = files.artifacts.findIndex(
        (item) => item.ref.fileEntryId === artifact.ref.fileEntryId,
      );
      if (index < 0) files.artifacts.push(artifact);
      else files.artifacts[index] = artifact;
    }
  }, context);
}
