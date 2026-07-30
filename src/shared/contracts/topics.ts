import type { Topic } from '@/shared/domain/topic';
import type { CursorPaginationResponse } from './dataTypes';
import type { CreateTopicDto, ListTopicsQuery, UpdateTopicDto } from './schemas/topics';

export interface TopicsBackend {
  create(input: CreateTopicDto): Promise<Topic>;
  get(id: string): Promise<Topic>;
  listPage(query?: ListTopicsQuery): Promise<CursorPaginationResponse<Topic>>;
  removeMany(ids: readonly string[]): Promise<void>;
  update(id: string, input: UpdateTopicDto): Promise<Topic>;
}
