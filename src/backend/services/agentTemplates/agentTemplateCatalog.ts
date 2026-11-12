import { z } from 'zod';

import {
  AgentTemplateCatalogSchema,
  type AgentTemplateCategory,
  type AgentTemplateLanguage,
} from '@/shared/data/types/agentTemplate';

const LegacyTemplatesSchema = z
  .array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().default(''),
      emoji: z.string(),
      group: z.array(z.string()).default([]),
      prompt: z.string(),
    }),
  )
  .min(1)
  .max(10_000);
const LocalizedTextSchema = z.object({ en: z.string(), zh: z.string() });
const NewTemplatesSchema = z.object({
  schemaVersion: z.literal(1),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: LocalizedTextSchema,
        description: LocalizedTextSchema,
        avatar: z.string(),
        category: z.string(),
        instructions: z.string(),
      }),
    )
    .max(10_000),
});

const CATEGORY_GROUPS: Record<AgentTemplateCategory, readonly string[]> = {
  writing: [
    'Writing',
    '写作',
    'Copywriting',
    '文案',
    'Translation',
    '翻译',
    'Language',
    '语言',
    'Communication',
    'Documentation',
  ],
  office: [
    'Career',
    '职业',
    'Business',
    '商业',
    'Office',
    '办公',
    'Consulting',
    '咨询',
    'Management',
    '管理',
    'Legal',
    '法律',
    'Marketing',
    '营销',
    'Finance',
    '金融',
    'Productivity',
    'Data & Analytics',
    'Analysis',
    '分析',
    'Review',
    '点评',
  ],
  programming: ['Programming', '编程', 'Developer Tools'],
  learning: ['Education', '教育', 'Academic', '学术', 'Science', '科学', 'Encyclopedia', '百科'],
  life: [
    'Life',
    '生活',
    'Emotion',
    'Emotional',
    '情感',
    'Entertainment',
    '娱乐',
    'Games',
    '游戏',
    'Medical',
    '医疗',
    'Health',
    '健康',
    'Travel',
    '旅游',
  ],
  creative: ['Creative', '创意', 'Art', '艺术', 'Design', '设计', 'Music', '音乐'],
};

function categoriesFor(groups: readonly string[]): AgentTemplateCategory[] {
  return (Object.keys(CATEGORY_GROUPS) as AgentTemplateCategory[]).filter((category) =>
    groups.some((group) => CATEGORY_GROUPS[category].includes(group)),
  );
}

export function parseAgentTemplateCatalog(
  legacy: unknown,
  agents: unknown,
  language: AgentTemplateLanguage,
  revision: string,
) {
  const assistants = LegacyTemplatesSchema.parse(legacy);
  const templates = NewTemplatesSchema.parse(agents);
  return AgentTemplateCatalogSchema.parse({
    language,
    revision,
    templates: [
      ...assistants.map((item) => ({ ...item, categories: categoriesFor(item.group) })),
      ...templates.items.map((item) => ({
        id: item.id,
        name: item.name[language],
        description: item.description[language],
        emoji: item.avatar,
        group: [item.category],
        prompt: item.instructions,
        categories: categoriesFor([item.category]),
      })),
    ],
  });
}
