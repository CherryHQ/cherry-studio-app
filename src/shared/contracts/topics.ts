import type {
  CreateTopicDto,
  ListTopicsQuery,
  UpdateTopicDto,
} from '@/shared/data/api/schemas/topics';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { Topic } from '@/shared/data/types/topic';

export interface TopicsBackend {
  create(input: CreateTopicDto): Promise<Topic>;
  get(id: string): Promise<Topic>;
  listPage(query?: ListTopicsQuery): Promise<CursorPaginationResponse<Topic>>;
  removeMany(ids: readonly string[]): Promise<void>;
  update(id: string, input: UpdateTopicDto): Promise<Topic>;
}
