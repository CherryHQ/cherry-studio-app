import * as z from 'zod';

import type { OffsetPaginationParams, OffsetPaginationResponse } from '@shared/data/api/types';
import {
  type Assistant,
  AssistantSchema,
  AssistantSettingsSchema,
} from '@shared/data/types/assistant';
import { TagIdSchema } from '@shared/data/types/tag';

import { type OrderEndpoints } from './_endpointHelpers';

const ASSISTANT_MUTABLE_FIELDS = {
  description: true,
  emoji: true,
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
  id: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(ASSISTANTS_MAX_LIMIT)
    .default(ASSISTANTS_DEFAULT_LIMIT),
  page: z.coerce.number().int().positive().default(ASSISTANTS_DEFAULT_PAGE),
  search: z.string().trim().min(1).optional(),
  tagIds: z.array(TagIdSchema).min(1).optional(),
});
export type ListAssistantsQueryParams = z.input<typeof ListAssistantsQuerySchema> &
  OffsetPaginationParams;
export type ListAssistantsQuery = z.output<typeof ListAssistantsQuerySchema>;

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
  '/assistants/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
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
