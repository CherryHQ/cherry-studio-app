import type { TranslateHistoryService } from '@/backend/data/services/TranslateHistoryService';
import type { TranslateLanguageService } from '@/backend/data/services/TranslateLanguageService';
import {
  CreateTranslateHistorySchema,
  CreateTranslateLanguageSchema,
  TranslateHistoryQuerySchema,
  type TranslateSchemas,
  UpdateTranslateHistorySchema,
  UpdateTranslateLanguageSchema,
} from '@/shared/data/api/schemas/translate';
import type { HandlersFor } from '@/shared/data/api/types';

export function createTranslateHandlers(
  history: TranslateHistoryService,
  language: TranslateLanguageService,
): HandlersFor<TranslateSchemas> {
  return {
    '/translate/histories': {
      DELETE: async () => history.clearAll(),
      GET: async ({ query }) => history.list(TranslateHistoryQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => history.create(CreateTranslateHistorySchema.parse(body)),
    },
    '/translate/histories/:id': {
      DELETE: async ({ params }) => history.delete(params.id),
      GET: async ({ params }) => history.getById(params.id),
      PATCH: async ({ body, params }) =>
        history.update(params.id, UpdateTranslateHistorySchema.parse(body)),
    },
    '/translate/languages': {
      GET: async () => language.list(),
      POST: async ({ body }) => language.create(CreateTranslateLanguageSchema.parse(body)),
    },
    '/translate/languages/:langCode': {
      DELETE: async ({ params }) => language.delete(params.langCode),
      GET: async ({ params }) => language.getByLangCode(params.langCode),
      PATCH: async ({ body, params }) =>
        language.update(params.langCode, UpdateTranslateLanguageSchema.parse(body)),
    },
  };
}
