import { z } from 'zod';

import { AgentEmojiAvatarSchema } from './agent';

export const AgentTemplateLanguageSchema = z.enum(['en', 'zh']);
export type AgentTemplateLanguage = z.infer<typeof AgentTemplateLanguageSchema>;

export const AgentTemplateCategorySchema = z.enum([
  'writing',
  'office',
  'programming',
  'learning',
  'life',
  'creative',
]);
export type AgentTemplateCategory = z.infer<typeof AgentTemplateCategorySchema>;

/** Shape of normalized local content; remote fields are read with per-field defaults. */
export const AgentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  emoji: AgentEmojiAvatarSchema,
  group: z.array(z.string()),
  prompt: z.string(),
  categories: z.array(AgentTemplateCategorySchema),
});
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;

export const AgentTemplateCatalogSchema = z.object({
  language: AgentTemplateLanguageSchema,
  /** Empty when branch metadata was unavailable; never used to skip a later download. */
  revision: z.string(),
  templates: z.array(AgentTemplateSchema).min(1),
});
export type AgentTemplateCatalog = z.infer<typeof AgentTemplateCatalogSchema>;
