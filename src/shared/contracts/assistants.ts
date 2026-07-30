import type { Assistant } from '@/shared/domain/assistant';
import type { OffsetPaginationResponse } from './dataTypes';
import type {
  CreateAssistantDto,
  ListAssistantsQueryParams,
  UpdateAssistantDto,
} from './schemas/assistants';

export interface AssistantsBackend {
  create(input: CreateAssistantDto): Promise<Assistant>;
  get(id: string): Promise<Assistant>;
  list(query?: ListAssistantsQueryParams): Promise<OffsetPaginationResponse<Assistant>>;
  remove(id: string): Promise<void>;
  update(id: string, input: UpdateAssistantDto): Promise<Assistant>;
}
