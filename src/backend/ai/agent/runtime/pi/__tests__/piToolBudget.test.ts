import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, defineDoc, Harness, MemoryStorage } from '@earendil-works/pi-durable';

import { PiToolBudget } from '../piToolBudget';

class ReopenableMemoryStorage extends MemoryStorage {
  override async close(): Promise<void> {}
}

describe('Pi persisted tool failures', () => {
  test('reads and updates released budget documents after reopening without a migration', async () => {
    const storage = new ReopenableMemoryStorage();
    const options = {
      registry: createRegistry(),
      models: createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
      }),
    };
    const legacyState = {
      inputId: 12,
      modelCalls: ['parent'],
      nestedCalls: ['child'],
      failedGroups: ['web'],
      finalResponseModelCalls: 1,
    };
    const legacyBudget = defineDoc({
      kind: 'cherry.tool-budget',
      version: 1,
      scope: 'conversation',
      history: 'latest',
      fork: 'current',
      initial: () => legacyState,
    });
    let harness = await Harness.open(storage, options, BACKGROUND_CONTEXT);
    try {
      const conversation = await harness.createConversation(
        { ownership: { kind: 'ownerless' } },
        BACKGROUND_CONTEXT,
      );
      await conversation.commit(async (tx) => {
        await tx.doc(legacyBudget, conversation.id);
      }, BACKGROUND_CONTEXT);
      await harness.close(BACKGROUND_CONTEXT);
      harness = await Harness.open(storage, options, BACKGROUND_CONTEXT);
      expect(await harness.snapshot(PiToolBudget, conversation.id, BACKGROUND_CONTEXT)).toEqual(
        legacyState,
      );
      const reopened = await harness.conversation(conversation.id, BACKGROUND_CONTEXT);
      await reopened!.commit(async (tx) => {
        (await tx.doc(PiToolBudget, conversation.id)).failedGroups.push('files');
      }, BACKGROUND_CONTEXT);
      await harness.close(BACKGROUND_CONTEXT);
      harness = await Harness.open(storage, options, BACKGROUND_CONTEXT);
      expect(await harness.snapshot(PiToolBudget, conversation.id, BACKGROUND_CONTEXT)).toEqual({
        ...legacyState,
        failedGroups: ['web', 'files'],
      });
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
    }
  });
});
