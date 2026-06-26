import { inArray, like, or } from 'drizzle-orm';

import { messageTable, topicTable } from '@/data/db/schemas';
import {
  mockBenchmarkMessageIdPrefix,
  mockBenchmarkTopicIdPrefix,
  mockTopicMessages,
} from '@/mocks/chat';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

const previousCuratedMockTopicIds = [
  '2d5b36de-a8e1-4d91-97cf-1de49f8b6d25',
  '2fba1d17-3e61-4c42-8ef5-d53cf637ef13',
  '78cf441c-647b-4d81-a9e2-83df1f36f4f8',
  '9361c1a4-cf44-42aa-90db-e7fa29b5dc2a',
  'cb356201-9358-497d-a489-5a6b7c271a77',
  'a0bb1e66-3bb2-4f77-b02f-7a9f7a5579e1',
  '1e0b8de7-71db-462f-a33a-c7e0f86992a8',
  'b760a398-3120-4f99-8c77-4fcb6351b57b',
  '43d70955-23ee-4a4d-8112-94472f0d88e8',
  'f00d1b79-cc6f-430c-bd7f-816f0b1ef3ac',
] as const;

export class MockChatSeeder implements DatabaseSeeder {
  readonly name = 'mock-chat';
  readonly description = 'Insert development mock chat topics and messages';
  readonly version: string;

  constructor() {
    this.version = hashObject(mockTopicMessages);
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    await dbService.withWriteTx(async (tx) => {
      await tx.delete(messageTable).where(like(messageTable.id, 'mock-message-%'));
      await tx
        .delete(messageTable)
        .where(like(messageTable.id, `${mockBenchmarkMessageIdPrefix}%`))
        .run();
      await tx
        .delete(topicTable)
        .where(
          or(
            inArray(topicTable.id, previousCuratedMockTopicIds),
            like(topicTable.id, '90000000-0000-4000-8000-%'),
            like(topicTable.id, `${mockBenchmarkTopicIdPrefix}%`),
          ),
        );

      for (const { messages, topic } of mockTopicMessages) {
        await tx
          .insert(topicTable)
          .values({
            activeNodeId: topic.activeNodeId ?? null,
            assistantId: null,
            createdAt: parseTimestamp(topic.createdAt),
            groupId: null,
            id: topic.id,
            isNameManuallyEdited: topic.isNameManuallyEdited,
            name: topic.name,
            orderKey: topic.orderKey,
            updatedAt: parseTimestamp(topic.updatedAt),
          })
          .onConflictDoNothing({
            target: topicTable.id,
          });

        for (const message of messages) {
          await tx
            .insert(messageTable)
            .values({
              createdAt: parseTimestamp(message.createdAt),
              data: message.data,
              id: message.id,
              parentId: message.parentId,
              role: message.role,
              searchableText: message.searchableText,
              siblingsGroupId: message.siblingsGroupId,
              status: message.status,
              topicId: message.topicId,
              updatedAt: parseTimestamp(message.updatedAt),
            })
            .onConflictDoNothing({
              target: messageTable.id,
            });
        }
      }
    });
  }
}

function parseTimestamp(value: string) {
  return Date.parse(value);
}
