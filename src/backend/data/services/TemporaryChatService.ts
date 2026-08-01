import { loggerService } from '@logger';
import { eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';

import type { DbService } from '@/backend/data/db/DbService';
import { messageTable, topicTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type { CreateMessageDto } from '@cherrystudio/universal/data/api/schemas/messages';
import type { CreateTopicDto } from '@cherrystudio/universal/data/api/schemas/topics';
import type {
  Message,
  MessageRole,
  MessageRuntimeStatsInput,
  MessageStatus,
} from '@cherrystudio/universal/data/types/message';
import type { Topic } from '@cherrystudio/universal/data/types/topic';

import { type AiUsageRecordService, mergeMessageUsageProjection } from './AiUsageRecordService';
import { createRootMessageTx } from './MessageService';
import { insertWithOrderKey } from './utils/orderKey';

const logger = loggerService.withContext('DataApi:TemporaryChatService');
const validRoles: readonly MessageRole[] = ['user', 'assistant', 'system'];
const acceptedStatuses: readonly MessageStatus[] = ['success', 'error', 'paused'];

type TemporaryTopicRow = Omit<Topic, 'createdAt' | 'updatedAt'> & {
  createdAt: number;
  updatedAt: number;
};
type TemporaryMessageRow = Omit<Message, 'createdAt' | 'updatedAt'> & {
  createdAt: number;
  updatedAt: number;
};

function rowToTopic(row: TemporaryTopicRow): Topic {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function rowToMessage(row: TemporaryMessageRow): Message {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export class TemporaryChatService {
  private readonly messages = new Map<string, TemporaryMessageRow[]>();
  private readonly topics = new Map<string, TemporaryTopicRow>();

  constructor(
    private readonly dbService: DbService,
    private readonly aiUsageRecordService: AiUsageRecordService,
  ) {}

  createTopic(dto: CreateTopicDto): Topic {
    const now = Date.now();
    const row: TemporaryTopicRow = {
      activeNodeId: undefined,
      assistantId: dto.assistantId ?? undefined,
      createdAt: now,
      id: uuidv4(),
      isNameManuallyEdited: false,
      name: dto.name ?? '',
      orderKey: '',
      updatedAt: now,
    };
    this.topics.set(row.id, row);
    this.messages.set(row.id, []);
    logger.info('Created temporary topic', { id: row.id });
    return rowToTopic(row);
  }

  deleteTopic(id: string): void {
    if (!this.topics.has(id)) throw DataApiErrorFactory.notFound('TemporaryTopic', id);
    this.topics.delete(id);
    this.messages.delete(id);
    logger.info('Deleted temporary topic', { id });
  }

  appendMessage(topicId: string, dto: CreateMessageDto, messageId?: string): Message {
    return this.appendMessageWithStats(topicId, dto, undefined, messageId);
  }

  async appendAssistantMessage(
    topicId: string,
    dto: Omit<CreateMessageDto, 'role'> & { role: 'assistant' },
    runtimeStats: MessageRuntimeStatsInput | undefined,
    messageId: string,
  ): Promise<Message> {
    const projection = await this.aiUsageRecordService.getMessageUsageProjection({
      id: messageId,
      kind: 'chat',
    });
    return this.appendMessageWithStats(
      topicId,
      dto,
      mergeMessageUsageProjection(runtimeStats, projection),
      messageId,
    );
  }

  hasTopic(topicId: string): boolean {
    return this.topics.has(topicId);
  }

  getTopic(topicId: string): Topic | null {
    const row = this.topics.get(topicId);
    return row ? rowToTopic(row) : null;
  }

  listMessages(topicId: string): Message[] {
    if (!this.topics.has(topicId)) {
      throw DataApiErrorFactory.notFound('TemporaryTopic', topicId);
    }
    return structuredClone(this.messages.get(topicId) ?? []).map(rowToMessage);
  }

  async persist(topicId: string): Promise<{ messageCount: number; topicId: string }> {
    const topic = this.topics.get(topicId);
    if (!topic) throw DataApiErrorFactory.notFound('TemporaryTopic', topicId);
    const messages = this.messages.get(topicId) ?? [];
    this.topics.delete(topicId);
    this.messages.delete(topicId);

    try {
      await this.dbService.withWriteTx(async (tx) => {
        await insertWithOrderKey(
          tx,
          topicTable,
          {
            assistantId: topic.assistantId ?? undefined,
            id: topic.id,
            name: topic.name ?? undefined,
          },
          { pkColumn: topicTable.id, scope: isNull(topicTable.deletedAt) },
        );

        const rootId = await createRootMessageTx(tx, topic.id);
        let previousId = rootId;
        for (const message of messages) {
          await tx.insert(messageTable).values({
            data: message.data,
            id: message.id,
            messageSnapshot: message.messageSnapshot ?? undefined,
            modelId: message.modelId ?? undefined,
            parentId: previousId,
            role: message.role,
            siblingsGroupId: 0,
            stats: message.stats ?? undefined,
            status: message.status,
            topicId: topic.id,
          });
          previousId = message.id;
        }

        if (previousId !== rootId) {
          await tx
            .update(topicTable)
            .set({ activeNodeId: previousId })
            .where(eq(topicTable.id, topic.id));
        }
      });
    } catch (error) {
      this.topics.set(topicId, topic);
      this.messages.set(topicId, messages);
      throw error;
    }

    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      await this.aiUsageRecordService.refreshMessageProjection({
        id: message.id,
        kind: 'chat',
      });
    }

    logger.info('Persisted temporary topic', { messageCount: messages.length, topicId });
    return { messageCount: messages.length, topicId };
  }

  private appendMessageWithStats(
    topicId: string,
    dto: CreateMessageDto,
    stats: Message['stats'] | undefined,
    messageId?: string,
  ): Message {
    if (!this.topics.has(topicId)) {
      throw DataApiErrorFactory.notFound('TemporaryTopic', topicId);
    }
    this.assertAcceptableAppendDto(dto);
    const now = Date.now();
    const row: TemporaryMessageRow = {
      createdAt: now,
      data: dto.data,
      id: messageId ?? uuidv7(),
      messageSnapshot: dto.messageSnapshot ?? null,
      modelId: dto.modelId ?? null,
      parentId: null,
      role: dto.role,
      searchableText: '',
      siblingsGroupId: 0,
      stats: stats ?? null,
      status: dto.status ?? 'success',
      topicId,
      updatedAt: now,
    };
    const list = this.messages.get(topicId);
    if (!list) throw DataApiErrorFactory.notFound('TemporaryTopic', topicId);
    list.push(row);
    return rowToMessage(row);
  }

  private assertAcceptableAppendDto(dto: CreateMessageDto): void {
    const errors: Record<string, string[]> = {};
    if (dto.parentId != null) {
      errors.parentId = ['parentId is not supported in temporary chats (no branching)'];
    }
    if (dto.siblingsGroupId != null && dto.siblingsGroupId !== 0) {
      errors.siblingsGroupId = ['non-zero siblingsGroupId is not supported in temporary chats'];
    }
    if (dto.setAsActive != null) {
      errors.setAsActive = ['setAsActive is not supported in temporary chats (no activeNode)'];
    }
    if (dto.status === 'pending') {
      errors.status = ['status=pending is not supported; post completed messages only'];
    }
    if (dto.role == null || !validRoles.includes(dto.role)) {
      errors.role = [`role must be one of ${validRoles.join(', ')}`];
    }
    if (dto.status != null && !acceptedStatuses.includes(dto.status) && dto.status !== 'pending') {
      errors.status ??= [`status must be one of ${acceptedStatuses.join(', ')}`];
    }
    if (Object.keys(errors).length > 0) throw DataApiErrorFactory.validation(errors);
  }
}
