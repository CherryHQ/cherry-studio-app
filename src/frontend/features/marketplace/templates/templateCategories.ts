import {
  type AgentTemplate,
  type AgentTemplateCategory,
  AgentTemplateCategorySchema,
} from '@/shared/data/types/agentTemplate';

export type TemplateCollectionId = AgentTemplateCategory | 'other';

export const TEMPLATE_COLLECTION_TITLE_KEYS = {
  writing: 'marketplace.category.writing',
  office: 'marketplace.category.office',
  programming: 'marketplace.category.programming',
  learning: 'marketplace.category.learning',
  life: 'marketplace.category.life',
  creative: 'marketplace.category.creative',
  other: 'marketplace.category.other',
} as const satisfies Record<TemplateCollectionId, string>;

/**
 * Templates grouped by category, in category order, omitting empty groups. A template appears in
 * each of its categories; one without a category goes to `other`.
 */
export function templateCollections(templates: readonly AgentTemplate[]) {
  return [...AgentTemplateCategorySchema.options, 'other' as const]
    .map((id) => ({
      id,
      templates: templates.filter((template) =>
        id === 'other' ? !template.categories.length : template.categories.includes(id),
      ),
    }))
    .filter((collection) => collection.templates.length > 0);
}
