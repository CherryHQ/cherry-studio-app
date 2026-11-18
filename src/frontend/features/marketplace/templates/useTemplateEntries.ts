import { useRouter } from 'expo-router';

import type { AgentTemplate } from '@/shared/data/types/agentTemplate';

import type { MarketplaceEntry } from '../components/MarketplaceRow';

export function useTemplateEntries(language: string) {
  const router = useRouter();
  return (template: AgentTemplate): MarketplaceEntry => ({
    description: template.description,
    emoji: template.emoji,
    key: template.id,
    kind: 'template',
    onPress: () =>
      router.push({
        pathname: '/skills/templates/[templateId]',
        params: { templateId: template.id, templateLanguage: language },
      }),
    testID: `template-${template.id}`,
    title: template.name,
  });
}
