import { Button, ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { MarketplaceList } from './components/MarketplaceList';
import { SKILL_SOURCE_TITLES, SkillDiscoveryState } from './skills/MarketplaceSkills';
import { type SkillDiscoverySource, useSkillDiscovery } from './skills/useSkillDiscovery';
import {
  TEMPLATE_COLLECTION_TITLE_KEYS,
  type TemplateCollectionId,
  templateCollections,
} from './templates/templateCategories';
import { useTemplateEntries } from './templates/useTemplateEntries';

/** Everything in one section of the Marketplace: a Skill source's results or an Agent category. */
export function MarketplaceBrowseScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    kind?: string | string[];
    query?: string | string[];
  }>();
  const id = getSingleRouteParam(params.id) ?? '';
  return getSingleRouteParam(params.kind) === 'skills' ? (
    <SkillSourceList
      query={getSingleRouteParam(params.query) ?? ''}
      source={id === 'skills-sh' ? 'skills-sh' : 'cherryin'}
    />
  ) : (
    <TemplateCategoryList
      category={
        Object.hasOwn(TEMPLATE_COLLECTION_TITLE_KEYS, id) ? (id as TemplateCollectionId) : 'other'
      }
    />
  );
}

function SkillSourceList({ query, source }: { query: string; source: SkillDiscoverySource }) {
  const { t } = useTranslation();
  const discovery = useSkillDiscovery(source, query);
  const { query: pages } = discovery;
  return (
    <>
      <RouteHeader title={SKILL_SOURCE_TITLES[source]} />
      <View className="flex-1 bg-background">
        <MarketplaceList
          empty={<SkillDiscoveryState discovery={discovery} />}
          entries={discovery.entries}
          footer={
            pages.isFetchingNextPage ? (
              <View className="items-center py-6">
                <Spinner accessibilityLabel={t('skills.loading')} size="sm" />
              </View>
            ) : pages.isFetchNextPageError ? (
              <View className="items-center py-4">
                <Button onPress={() => void pages.fetchNextPage()} size="sm" variant="ghost">
                  {t('common.retry')}
                </Button>
              </View>
            ) : null
          }
          onEndReached={() => {
            if (pages.hasNextPage && !pages.isFetching && !pages.isFetchNextPageError)
              void pages.fetchNextPage();
          }}
          testID="marketplace-browse"
        />
      </View>
    </>
  );
}

function TemplateCategoryList({ category }: { category: TemplateCollectionId }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const { catalog, error, isLoading, refetch } = useAgentTemplateCatalog(language);
  const toEntry = useTemplateEntries(language);
  const templates =
    templateCollections(catalog?.templates ?? []).find((collection) => collection.id === category)
      ?.templates ?? [];
  return (
    <>
      <RouteHeader title={t(TEMPLATE_COLLECTION_TITLE_KEYS[category])} />
      <View className="flex-1 bg-background">
        <MarketplaceList
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
          entries={templates.map(toEntry)}
          testID="marketplace-browse"
        />
      </View>
    </>
  );
}
