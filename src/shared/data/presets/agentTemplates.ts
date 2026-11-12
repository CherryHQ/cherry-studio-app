import { resolveAppLanguage } from '@/shared/utils/languages';

export type AgentTemplateCategory =
  | 'writing'
  | 'office'
  | 'programming'
  | 'learning'
  | 'life'
  | 'creative';

export type AgentTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  group: readonly string[];
  prompt: string;
  categories: readonly AgentTemplateCategory[];
};

/** Bundled source content: Chinese for Chinese UI locales, English otherwise. */
export function getAgentTemplates(language: string): readonly AgentTemplate[] {
  const locale = resolveAppLanguage(language);
  // Static requires keep both catalogs available offline and load only the chosen language.
  return locale === 'zh-CN' || locale === 'zh-TW'
    ? require('@/assets/agents/templates/zh.json')
    : require('@/assets/agents/templates/en.json');
}

export function getAgentTemplate(id: string, language: string): AgentTemplate | undefined {
  return getAgentTemplates(language).find((template) => template.id === id);
}
