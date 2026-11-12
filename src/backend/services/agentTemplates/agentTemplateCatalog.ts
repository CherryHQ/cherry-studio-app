import { AgentEmojiAvatarSchema, CHERRY_AGENT_AVATAR } from '@/shared/data/types/agent';
import type {
  AgentTemplate,
  AgentTemplateCatalog,
  AgentTemplateCategory,
  AgentTemplateLanguage,
} from '@/shared/data/types/agentTemplate';

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

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function localizedText(value: unknown, language: AgentTemplateLanguage): string {
  if (typeof value === 'string') return value;
  const text = value as { en?: unknown; zh?: unknown } | null | undefined;
  return readText(text?.[language]) || readText(text?.en) || readText(text?.zh);
}

function readTemplates(
  value: unknown,
  source: 'legacy' | 'marketplace',
  language: AgentTemplateLanguage,
): AgentTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const isLegacy = source === 'legacy';
    const id = readText(item.id).trim() || `${source}-${index + 1}`;
    const group = isLegacy
      ? Array.isArray(item.group)
        ? item.group.filter((value): value is string => typeof value === 'string')
        : []
      : [readText(item.category)].filter(Boolean);
    const avatar = AgentEmojiAvatarSchema.safeParse(
      readText(isLegacy ? item.emoji : item.avatar).trim(),
    );
    return [
      {
        id,
        name: (isLegacy ? readText(item.name) : localizedText(item.name, language)).trim() || id,
        description: isLegacy
          ? readText(item.description)
          : localizedText(item.description, language),
        emoji: avatar.success ? avatar.data : CHERRY_AGENT_AVATAR,
        group,
        prompt: readText(isLegacy ? item.prompt : item.instructions),
        categories: categoriesFor(group),
      },
    ];
  });
}

/** Remote fields are optional display content, never a whole-catalog validation gate. */
export function parseAgentTemplateCatalog(
  legacy: unknown,
  agents: unknown,
  language: AgentTemplateLanguage,
  revision: string,
): AgentTemplateCatalog {
  const marketplace = agents as { items?: unknown } | null | undefined;
  const templates = [
    ...readTemplates(legacy, 'legacy', language),
    ...readTemplates(marketplace?.items, 'marketplace', language),
  ];
  return {
    language,
    revision,
    templates: [...new Map(templates.map((item) => [item.id, item])).values()],
  };
}
