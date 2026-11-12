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

export const AgentTemplateSchema = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  description: z.string().max(20_000),
  emoji: AgentEmojiAvatarSchema,
  group: z.array(z.string().max(200)).max(100),
  prompt: z.string().min(1).max(200_000),
  categories: z.array(AgentTemplateCategorySchema).max(6),
});
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;

export const AgentTemplateRevisionSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const AgentTemplateCatalogSchema = z.strictObject({
  language: AgentTemplateLanguageSchema,
  revision: AgentTemplateRevisionSchema,
  templates: z
    .array(AgentTemplateSchema)
    .min(1)
    .max(10_000)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      'Duplicate template IDs',
    ),
});
export type AgentTemplateCatalog = z.infer<typeof AgentTemplateCatalogSchema>;
