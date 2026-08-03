import {
  DEFAULT_ASSISTANT_SEED,
  getDefaultAssistantNameForLocale,
} from '@cherrystudio/universal/data/presets/defaultAssistant';
import { and, eq, isNull } from 'drizzle-orm';
import { getLocales } from 'expo-localization';

import type { InsertAssistantRow } from '@/backend/data/db/schemas';
import { assistantTable, messageTable, topicTable } from '@/backend/data/db/schemas';
import { createRootMessageTx } from '@/backend/data/services/MessageService';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

export class DefaultAssistantSeeder implements DatabaseSeeder {
  readonly name = 'defaultAssistant';
  readonly description = 'Insert the default assistant and an empty topic for new users';
  readonly executionPolicy = 'bootstrap-only' as const;
  readonly version = hashObject({
    assistant: DEFAULT_ASSISTANT_SEED,
    freshGuard: 'bootstrap-only; no active assistant/topic/message',
    localizedName: 'locales[0].languageTag; zh=>Cherry 助手; other=>Cherry Assistant',
    topic: { empty: true, name: '' },
  });

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    await dbService.withWriteTx(async (tx) => {
      if (!(await isFreshDatabase(tx))) {
        return;
      }

      const insertValues = {
        ...DEFAULT_ASSISTANT_SEED,
        name: getDefaultAssistantNameForLocale(getPreferredSystemLanguage()),
        settings: { ...DEFAULT_ASSISTANT_SEED.settings },
      } satisfies Omit<InsertAssistantRow, 'orderKey'>;
      const assistant = await insertWithOrderKey(tx, assistantTable, insertValues, {
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
          scope: isNull(topicTable.deletedAt),
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
      .leftJoin(topicTable, eq(messageTable.topicId, topicTable.id))
      .where(and(isNull(messageTable.deletedAt), isNull(topicTable.deletedAt)))
      .limit(1),
  ]);

  return !assistant && !topic && !message;
}

function getPreferredSystemLanguage(): string | undefined {
  try {
    return getLocales()[0]?.languageTag;
  } catch {
    return undefined;
  }
}
