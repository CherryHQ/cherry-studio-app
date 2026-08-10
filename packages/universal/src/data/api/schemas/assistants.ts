import type { OffsetPaginationResponse } from '@shared/data/api/types';
import {
  type Assistant,
  AssistantSchema,
  AssistantSettingsSchema,
} from '@shared/data/types/assistant';
import { GroupIdSchema, GroupNameSchema } from '@shared/data/types/group';
import { TagIdSchema } from '@shared/data/types/tag';
import * as z from 'zod';

import { type OrderEndpoints } from './_endpointHelpers';

const ASSISTANT_MUTABLE_FIELDS = {
  description: true,
  emoji: true,
  groupId: true,
  modelId: true,
  name: true,
  prompt: true,
  settings: true,
} as const;

const TagIdsField = z.array(TagIdSchema).optional();
const McpServerIdsField = z.array(z.string()).optional();

export const CreateAssistantSchema = AssistantSchema.pick(ASSISTANT_MUTABLE_FIELDS)
  .partial()
  .required({ name: true })
  .extend({ mcpServerIds: McpServerIdsField, tagIds: TagIdsField })
  .strict();
export type CreateAssistantDto = z.infer<typeof CreateAssistantSchema>;

export const ImportAssistantSchema = CreateAssistantSchema.pick({
  description: true,
  emoji: true,
  name: true,
  prompt: true,
  settings: true,
}).extend({
  groupName: GroupNameSchema.optional(),
});
export type ImportAssistantDto = z.infer<typeof ImportAssistantSchema>;

export const UpdateAssistantSchema = AssistantSchema.pick(ASSISTANT_MUTABLE_FIELDS)
  .partial()
  .extend({
    mcpServerIds: McpServerIdsField,
    settings: AssistantSettingsSchema.partial().optional(),
    tagIds: TagIdsField,
  })
  .strict();
export type UpdateAssistantDto = z.infer<typeof UpdateAssistantSchema>;

export const ASSISTANTS_DEFAULT_PAGE = 1;
export const ASSISTANTS_DEFAULT_LIMIT = 100;
export const ASSISTANTS_MAX_LIMIT = 500;

export const ListAssistantsQuerySchema = z.strictObject({
  groupId: GroupIdSchema.optional(),
  id: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(ASSISTANTS_MAX_LIMIT)
    .default(ASSISTANTS_DEFAULT_LIMIT),
  page: z.coerce.number().int().positive().default(ASSISTANTS_DEFAULT_PAGE),
  search: z.string().trim().min(1).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'orderKey']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  tagIds: z.array(TagIdSchema).min(1).optional(),
  updatedAtFrom: z.iso.datetime().optional(),
});
export type ListAssistantsQueryParams = z.input<typeof ListAssistantsQuerySchema>;
export type ListAssistantsQuery = z.output<typeof ListAssistantsQuerySchema>;

export const DeleteAssistantQuerySchema = z.strictObject({
  deleteTopics: z.boolean().optional(),
});
export type DeleteAssistantQueryParams = z.input<typeof DeleteAssistantQuerySchema>;

export interface DeleteAssistantResult {
  deleted: boolean;
  deletedTopicIds?: string[];
}

export type AssistantSchemas = {
  '/assistants': {
    GET: {
      query?: ListAssistantsQueryParams;
      response: OffsetPaginationResponse<Assistant>;
    };
    POST: {
      body: CreateAssistantDto;
      response: Assistant;
    };
  };
  '/assistants:import': {
    POST: {
      body: ImportAssistantDto;
      response: Assistant;
    };
  };
  '/assistants/:id': {
    DELETE: {
      params: { id: string };
      query?: DeleteAssistantQueryParams;
      response: DeleteAssistantResult;
    };
    GET: {
      params: { id: string };
      response: Assistant;
    };
    PATCH: {
      body: UpdateAssistantDto;
      params: { id: string };
      response: Assistant;
    };
  };
} & OrderEndpoints<'/assistants'>;
