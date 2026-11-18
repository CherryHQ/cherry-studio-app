import { Button, ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar } from '@/frontend/components/Avatar';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';
import type { AgentTemplateCategory } from '@/shared/data/types/agentTemplate';

import { MarketplaceFilter } from '../components/MarketplaceFilter';
import { MarketplaceList } from '../components/MarketplaceList';
import { AGENT_TEMPLATE_CATEGORY_KEYS } from './templateCategories';

type CategoryFilter = AgentTemplateCategory | 'all';

/** Browses saved Agent templates; a row opens the template's own page. */
export function AgentTemplateCatalog({ query }: { query: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const { catalog, error, isLoading, refetch } = useAgentTemplateCatalog(language);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const keywords = toSearchKeywords(query);
  const templates = (catalog?.templates ?? []).filter(
    (template) =>
      (category === 'all' || template.categories.includes(category)) &&
      (keywords.length === 0 ||
        matchesSearchKeywords(keywords, [
          template.name,
          template.description,
          template.prompt,
          ...template.group,
          ...template.categories.map((value) => t(AGENT_TEMPLATE_CATEGORY_KEYS[value])),
        ])),
  );

  return (
    <View className="flex-1">
      <MarketplaceFilter
        accessibilityLabel={t('marketplace.category.label')}
        items={[
          { value: 'all', label: t('marketplace.category.all') },
          ...Object.entries(AGENT_TEMPLATE_CATEGORY_KEYS).map(([value, key]) => ({
            value: value as AgentTemplateCategory,
            label: t(key),
          })),
        ]}
        onValueChange={setCategory}
        testID="marketplace-template-category"
        value={category}
      />
      <MarketplaceList
        data={templates}
        empty={
          isLoading ? (
            <ContentState.Loading title={t('marketplace.templates.loading')} />
          ) : error && !catalog ? (
            <ContentState.Error
              title={t('marketplace.templates.loadFailed')}
              primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
            />
          ) : (
            <ContentState.Empty title={t('marketplace.templates.empty')} />
          )
        }
        header={
          error && catalog ? (
            // Saved templates stay usable; the failed refresh is a quiet, repeatable note.
            <View className="flex-row items-center gap-2 px-3 pb-3">
              <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
                {t('marketplace.templates.cached')}
              </Text>
              <Button onPress={() => void refetch()} size="inline" variant="ghost">
                {t('common.retry')}
              </Button>
            </View>
          ) : null
        }
        renderRow={(template) => ({
          accessibilityLabel: template.name,
          description: template.description,
          key: template.id,
          leading: <AgentAvatar emoji={template.emoji} name={template.name} />,
          onPress: () =>
            router.push({
              pathname: '/skills/templates/[templateId]',
              params: { templateId: template.id, templateLanguage: language },
            }),
          testID: `template-${template.id}`,
          title: template.name,
        })}
        testID="marketplace-templates"
      />
    </View>
  );
}
