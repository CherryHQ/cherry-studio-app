import type { AgentTemplateLanguage } from '@/shared/data/types/agentTemplate';

import { resolveAppLanguage } from './languages';

export function agentTemplateLanguage(language: string): AgentTemplateLanguage {
  const locale = resolveAppLanguage(language);
  return locale === 'zh-CN' || locale === 'zh-TW' ? 'zh' : 'en';
}
