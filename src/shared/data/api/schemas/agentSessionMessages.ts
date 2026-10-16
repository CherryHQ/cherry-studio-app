import * as z from 'zod';

import type { AgentMessageView, AgentSessionView } from '@/shared/contracts/agent';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import {
  MessageTranslationResultSchema,
  MessageTranslationsSchema,
  type MessageTranslations,
} from '@/shared/data/types/messageTranslation';
import { APP_LANGUAGES } from '@/shared/utils/languages';

export const AGENT_SESSION_MESSAGES_DEFAULT_LIMIT = 50;
export const AGENT_SESSION_MESSAGES_MAX_LIMIT = 200;

/**
 * Items always remain newest-first. nextCursor continues toward older messages;
 * previousCursor is read with direction=newer. An initial aroundMessageId page
 * contains the target and its neighbors, bounded by limit in total.
 * ids resolves a bounded selection in the same order, without pagination.
 * settledOnly excludes unsettled rows and their entire turn before pagination; live observation
 * supplies the active turn separately from these persisted history pages.
 */
export const ListAgentSessionMessagesQuerySchema = z
  .strictObject({
    aroundMessageId: z.string().min(1).optional(),
    /** Explicit path keeps in-flight pagination bound to its original continuation. */
    pathId: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    direction: z.enum(['older', 'newer']).optional(),
    limit: z.coerce.number().int().positive().max(AGENT_SESSION_MESSAGES_MAX_LIMIT).optional(),
    settledOnly: z.boolean().optional(),
    ids: z
      .union([
        z
          .string()
          .min(1)
          .transform((id) => [id]),
        z.array(z.string().min(1)).min(1).max(AGENT_SESSION_MESSAGES_MAX_LIMIT),
      ])
      .optional(),
  })
  .refine(
    (query) =>
      !query.ids ||
      (!query.aroundMessageId &&
        !query.cursor &&
        !query.direction &&
        !query.limit &&
        query.settledOnly === undefined),
    {
      message: 'ids cannot be combined with window or pagination options',
      path: ['ids'],
    },
  )
  .refine((query) => !query.aroundMessageId || (!query.cursor && !query.direction), {
    message: 'aroundMessageId cannot be combined with cursor or direction',
    path: ['aroundMessageId'],
  })
  .refine((query) => query.direction !== 'newer' || Boolean(query.cursor), {
    message: 'Newer pagination requires a cursor',
    path: ['cursor'],
  });
export type ListAgentSessionMessagesQueryParams = z.input<
  typeof ListAgentSessionMessagesQuerySchema
>;
export type ListAgentSessionMessagesQuery = z.output<typeof ListAgentSessionMessagesQuerySchema>;

export type AgentSessionMessagePage = CursorPaginationResponse<AgentMessageView> & {
  previousCursor?: string;
};

export const SaveAgentMessageTranslationSchema = z.strictObject({
  sourceHash: MessageTranslationsSchema.shape.sourceHash,
  language: z.enum(APP_LANGUAGES.map(({ value }) => value)),
  content: MessageTranslationResultSchema.shape.content,
});
export type SaveAgentMessageTranslation = z.infer<typeof SaveAgentMessageTranslationSchema>;

export const AgentTranscriptSelectionSchema = z.strictObject({
  ids: z.array(z.string().min(1)).min(1).max(128),
});
export type AgentTranscriptSelection = {
  assistantName?: string;
  session: AgentSessionView;
  messages: AgentMessageView[];
};

export type AgentSessionMessageSchemas = {
  '/agent-sessions/:sessionId/messages/:messageId/translations': {
    PATCH: {
      params: { sessionId: string; messageId: string };
      body: SaveAgentMessageTranslation;
      response: MessageTranslations;
    };
  };
  '/agent-sessions/:sessionId/messages/selection': {
    GET: {
      params: { sessionId: string };
      query: z.input<typeof AgentTranscriptSelectionSchema>;
      response: AgentTranscriptSelection;
    };
  };
  '/agent-sessions/:sessionId/messages': {
    GET: {
      params: { sessionId: string };
      query?: ListAgentSessionMessagesQueryParams;
      response: AgentSessionMessagePage;
    };
  };
};
