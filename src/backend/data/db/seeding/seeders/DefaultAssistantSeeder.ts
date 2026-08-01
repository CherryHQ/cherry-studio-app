import { isNull } from 'drizzle-orm';

import { assistantTable, messageTable, topicTable } from '@/backend/data/db/schemas';
import { createRootMessageTx } from '@/backend/data/services/MessageService';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import { DEFAULT_ASSISTANT_SEED } from '@cherrystudio/universal/data/presets/defaultAssistant';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

export class DefaultAssistantSeeder implements DatabaseSeeder {
  readonly name = 'default-assistant';
  readonly description = 'Insert the default assistant and an empty topic for fresh databases';
  readonly version = hashObject({
    assistant: DEFAULT_ASSISTANT_SEED,
    freshGuard: 'no live assistant, topic, or message',
    topic: { empty: true, name: '' },
  });

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    await dbService.withWriteTx(async (tx) => {
      if (!(await isFreshDatabase(tx))) {
        return;
      }

      const assistant = await insertWithOrderKey(tx, assistantTable, DEFAULT_ASSISTANT_SEED, {
        pkColumn: assistantTable.id,
        scope: isNull(assistantTable.deletedAt),
      });
      const topic = await insertWithOrderKey(
        tx,
        topicTable,
        {
          activeNodeId: null,
          assistantId: assistant.id as string,
          name: '',
        },
        {
          pkColumn: topicTable.id,
        },
      );

      await createRootMessageTx(tx, topic.id as string);
    });
  }
}

async function isFreshDatabase(tx: any): Promise<boolean> {
  const [[assistant], [topic], [message]] = await Promise.all([
    tx
      .select({ id: assistantTable.id })
      .from(assistantTable)
      .where(isNull(assistantTable.deletedAt))
      .limit(1),
    tx.select({ id: topicTable.id }).from(topicTable).where(isNull(topicTable.deletedAt)).limit(1),
    tx
      .select({ id: messageTable.id })
      .from(messageTable)
      .where(isNull(messageTable.deletedAt))
      .limit(1),
  ]);

  return !assistant && !topic && !message;
}
