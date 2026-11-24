import { Button, ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRootNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';
import { EmptyIllustration } from '@/frontend/components/EmptyIllustration';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';

import { MarketplaceList } from '../components/MarketplaceList';
import { MarketplaceSection } from '../components/MarketplaceSection';
import { TEMPLATE_COLLECTION_TITLE_KEYS, templateCollections } from './templateCategories';
import { useTemplateEntries } from './useTemplateEntries';

/** Templates preview by category; a search lists every match in one place. */
export function AgentTemplateCatalog({
  browseHeader,
  query,
}: {
  browseHeader: ReactNode;
  query: string;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useRootNavigationDockClearance();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const { catalog, error, isLoading, refetch } = useAgentTemplateCatalog(language);
  const toEntry = useTemplateEntries(language);
  const templates = catalog?.templates ?? [];
  const keywords = toSearchKeywords(query);

  const state = isLoading ? (
    <ContentState.Loading title={t('marketplace.templates.loading')} />
  ) : error && !catalog ? (
    <ContentState.Error
      title={t('marketplace.templates.loadFailed')}
      primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
    />
  ) : (
    <ContentState.Empty
      icon={<EmptyIllustration scene={keywords.length ? 'search' : 'collection'} size="panel" />}
      title={t('marketplace.templates.empty')}
    />
  );
  // Saved templates stay usable; a failed refresh is a quiet, repeatable note.
  const staleNote =
    error && catalog ? (
      <View className="flex-row items-center gap-2 px-4 pb-2">
        <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
          {t('marketplace.templates.cached')}
        </Text>
        <Button onPress={() => void refetch()} size="inline" variant="ghost">
          {t('common.retry')}
        </Button>
      </View>
    ) : null;

  if (keywords.length)
    return (
      <MarketplaceList
        empty={state}
        entries={templates
          .filter((template) =>
            matchesSearchKeywords(keywords, [
              template.name,
              template.description,
              template.prompt,
              ...template.group,
            ]),
          )
          .map(toEntry)}
        header={staleNote}
        testID="marketplace-templates"
      />
    );

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 pt-2"
      contentContainerStyle={{ paddingBottom: bottom + dockClearance + 24 }}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      testID="marketplace-templates"
    >
      {browseHeader}
      {staleNote}
      {templates.length ? null : <View className="px-8 py-10">{state}</View>}
      {templateCollections(templates).map(({ id, templates: members }) => (
        <MarketplaceSection
          entries={members.map(toEntry)}
          key={id}
          onOpen={() => router.push({ pathname: '/skills/browse', params: { kind: 'agents', id } })}
          testID={`marketplace-category-${id}`}
          title={t(TEMPLATE_COLLECTION_TITLE_KEYS[id])}
        />
      ))}
    </ScrollView>
  );
}
