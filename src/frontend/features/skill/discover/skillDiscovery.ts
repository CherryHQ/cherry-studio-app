import type { MarketplaceText } from '@/shared/contracts/skillMarketplace';

export type SkillDiscoverySource = 'cherryin' | 'skills-sh';

export function marketplaceText(text: MarketplaceText, language: string): string {
  return language.toLowerCase().startsWith('zh') ? text.zh || text.en : text.en || text.zh || '';
}

export const MARKETPLACE_DOMAINS = [
  'AI & Agents',
  'Productivity',
  'Developer Tools',
  'Design',
  'Data & Analytics',
  'Communication',
  'Documentation',
  'Automation',
  'Other',
] as const;
