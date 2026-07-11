import type { CreateAssistantDto } from '@/data/api/schemas/assistants';
import { createUniqueModelId } from '@/data/types/model';

/** A single assistant preset from the bundled catalog JSON files. */
export interface AssistantCatalogPreset {
  id: string;
  name: string;
  prompt?: string;
  description?: string;
  emoji?: string;
  group?: string[];
  defaultModel?: { id?: string; provider?: string; name?: string; group?: string };
}

export interface AssistantCatalogTab {
  id: string;
  label: string;
  count: number;
}

// ---- Group ordering (mirrors desktop's ORDERED_GROUP_ALIASES) ----

const GROUP_RANK_ALIASES = [
  ['精选', 'Featured'],
  ['职业', 'Career'],
  ['商业', 'Business'],
  ['工具', 'Tools'],
  ['语言', 'Language'],
  ['办公', 'Office'],
  ['通用', 'General'],
  ['写作', 'Writing'],
  ['编程', 'Programming'],
  ['情感', 'Emotional'],
  ['教育', 'Education'],
  ['创意', 'Creative'],
  ['学术', 'Academic'],
  ['设计', 'Design'],
  ['艺术', 'Art'],
  ['娱乐', 'Entertainment'],
  ['生活', 'Life'],
];

const groupRankMap = new Map<string, number>();
GROUP_RANK_ALIASES.forEach((aliases, rank) => {
  for (const alias of aliases) groupRankMap.set(alias, rank);
});

// ---- Data loading ----

import agentsEn from './data/agents-en.json';
// Static requires so Metro can resolve the JSON files at build time.
// (Dynamic `require(`./data/${fileName}`)` is not supported by Metro.)
import agentsZh from './data/agents-zh.json';

/** @internal exported for testing */
export 
function normalizePresets(value: unknown): AssistantCatalogPreset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is AssistantCatalogPreset =>
    Boolean(p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string'),
  );
}

/** Load bundled assistant presets JSON. */
export function loadAssistantCatalogPresets(language: string): AssistantCatalogPreset[] {
  const data: unknown = language.startsWith('zh') ? agentsZh : agentsEn;
  return normalizePresets(data);
}

// ---- Group & search helpers ----

function getPresetGroups(preset: AssistantCatalogPreset): string[] {
  return Array.isArray(preset.group) ? preset.group.filter(Boolean) : [];
}

function sortGroups(a: string, b: string): number {
  const rankA = groupRankMap.get(a) ?? Number.MAX_SAFE_INTEGER;
  const rankB = groupRankMap.get(b) ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b, 'zh');
}

export function buildAssistantCatalogTabs(
  presets: AssistantCatalogPreset[],
  allLabel: string,
): AssistantCatalogTab[] {
  const counts = new Map<string, number>();
  presets.forEach((preset) => {
    for (const g of getPresetGroups(preset)) counts.set(g, (counts.get(g) ?? 0) + 1);
  });
  const categoryTabs = Array.from(counts.entries())
    .sort(([a], [b]) => sortGroups(a, b))
    .map(([id, count]) => ({ id, label: id, count }));
  return [{ id: '__all__', label: allLabel, count: presets.length }, ...categoryTabs];
}

export function filterAssistantCatalogPresets(
  presets: AssistantCatalogPreset[],
  activeTab: string,
  search: string,
): AssistantCatalogPreset[] {
  const keyword = search.trim().toLowerCase();
  return presets.filter((preset) => {
    if (activeTab !== '__all__' && !getPresetGroups(preset).includes(activeTab)) return false;
    if (!keyword) return true;
    return [preset.name, preset.description, preset.prompt]
      .filter(Boolean)
      .some((text) => text?.toLowerCase().includes(keyword));
  });
}

/** Map a catalog preset to the DTO used by AssistantService.create(). */
export function toCreateAssistantDtoFromCatalogPreset(
  preset: AssistantCatalogPreset,
): CreateAssistantDto {
  const dto: CreateAssistantDto = { name: preset.name.trim() };
  if (preset.prompt?.trim()) dto.prompt = preset.prompt.trim();
  if (preset.description?.trim()) dto.description = preset.description.trim();
  if (preset.emoji?.trim()) dto.emoji = preset.emoji.trim();
  if (preset.defaultModel?.provider && preset.defaultModel.id) {
    dto.modelId = createUniqueModelId(preset.defaultModel.provider, preset.defaultModel.id);
  }
  return dto;
}

export function getPresetKey(preset: Pick<AssistantCatalogPreset, 'id'>): string {
  return preset.id;
}
