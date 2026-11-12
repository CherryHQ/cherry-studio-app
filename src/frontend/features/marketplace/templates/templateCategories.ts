import type { AgentTemplateCategory } from '@/shared/data/presets/agentTemplates';

export const AGENT_TEMPLATE_CATEGORY_KEYS = {
  writing: 'marketplace.category.writing',
  office: 'marketplace.category.office',
  programming: 'marketplace.category.programming',
  learning: 'marketplace.category.learning',
  life: 'marketplace.category.life',
  creative: 'marketplace.category.creative',
} as const satisfies Record<AgentTemplateCategory, string>;
