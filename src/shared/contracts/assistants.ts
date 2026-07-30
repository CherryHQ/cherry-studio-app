import type {
  CreateAssistantDto,
  ListAssistantsQueryParams,
  UpdateAssistantDto,
} from '@/shared/data/api/schemas/assistants';
import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import type { Assistant } from '@/shared/data/types/assistant';

export interface AssistantsBackend {
  create(input: CreateAssistantDto): Promise<Assistant>;
  get(id: string): Promise<Assistant>;
  list(query?: ListAssistantsQueryParams): Promise<OffsetPaginationResponse<Assistant>>;
  remove(id: string): Promise<void>;
  update(id: string, input: UpdateAssistantDto): Promise<Assistant>;
}
