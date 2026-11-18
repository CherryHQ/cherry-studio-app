import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  ActionMenu,
  BottomSheet,
  Button,
  ContentState,
  SearchField,
} from '@cherrystudio/ui/components';
import { useIsFocused, useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/frontend/components/Avatar';
import { useInlineSearch } from '@/frontend/components/InlineSearch';
import { useAgentTemplateCatalog } from '@/frontend/data/agentTemplates';
import { type AgentTemplate, type AgentTemplateCategory } from '@/shared/data/types/agentTemplate';

import { MarketplaceItem, MarketplaceItemContent } from '../components/MarketplaceItem';
import { AgentTemplateDetails } from './AgentTemplateDetails';
import { AGENT_TEMPLATE_CATEGORY_KEYS } from './templateCategories';

const EMPTY_TEMPLATES: readonly AgentTemplate[] = [];
type TemplatePreview = {
  template: AgentTemplate;
  language: string;
  phase: 'open' | 'closing' | 'creating';
};

export function AgentTemplateCatalog() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { bottom } = useSafeAreaInsets();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const { catalog, error, isLoading, refetch } = useAgentTemplateCatalog(language);
  const [category, setCategory] = useState<AgentTemplateCategory | 'all'>('all');
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const { query, setQuery, results } = useInlineSearch({
    items: catalog?.templates ?? EMPTY_TEMPLATES,
    fields: (template) => [
      template.name,
      template.description,
      template.prompt,
      ...template.group,
      ...template.categories.map((value) => t(AGENT_TEMPLATE_CATEGORY_KEYS[value])),
    ],
  });
  const filtered =
    category === 'all' ? results : results.filter((item) => item.categories.includes(category));

  function createTemplate(template: AgentTemplate, sourceLanguage: string) {
    if (navigation.isFocused())
      router.push({
        pathname: '/agents/new',
        params: { templateId: template.id, templateLanguage: sourceLanguage, startChat: 'true' },
      });
  }

  function finishPreview() {
    setPreview(null);
    // Dismiss the native sheet before handing the frozen identity to the existing editor route.
    if (preview?.phase === 'creating') createTemplate(preview.template, preview.language);
  }

  return (
    <View className="flex-1">
      <View className="px-5 pt-4 pb-3">
        <SearchField
          accessibilityLabel={t('marketplace.templates.search')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder={t('marketplace.templates.search')}
          testID="marketplace-template-search"
          value={query}
          variant="inset"
        />
      </View>
      <View className="min-h-11 flex-row items-center justify-between gap-3 px-5">
        <ActionMenu
          items={[
            {
              id: 'all',
              label: t('marketplace.category.all'),
              checked: category === 'all',
              onPress: () => setCategory('all'),
            },
            ...Object.entries(AGENT_TEMPLATE_CATEGORY_KEYS).map(([value, key]) => ({
              id: value,
              label: t(key),
              checked: category === value,
              onPress: () => setCategory(value as AgentTemplateCategory),
            })),
          ]}
        >
          <Button hitSlop={8} size="inline" variant="ghost" testID="marketplace-template-category">
            <Button.Label>
              {t(
                category === 'all'
                  ? 'marketplace.category.all'
                  : AGENT_TEMPLATE_CATEGORY_KEYS[category],
              )}
            </Button.Label>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        </ActionMenu>
        {catalog ? (
          <Text className="text-xs text-muted-foreground">
            {t('marketplace.templates.count', { count: filtered.length })}
          </Text>
        ) : null}
      </View>
      {error && catalog ? (
        <View className="flex-row items-center gap-3 px-5 py-2">
          <Text className="flex-1 text-xs text-muted-foreground">
            {t('marketplace.templates.cached')}
          </Text>
          <Button size="sm" variant="ghost" onPress={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </View>
      ) : null}
      <FlatList
        key={`${category}:${query}`}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottom + 24, paddingHorizontal: 20 }}
        contentInsetAdjustmentBehavior="never"
        data={filtered}
        initialNumToRender={8}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(template) => template.id}
        ListEmptyComponent={
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
        renderItem={({ item }) => (
          <MarketplaceItem
            accessibilityLabel={t('marketplace.templates.preview', { name: item.name })}
            action={
              <Button
                accessibilityLabel={t('marketplace.templates.use', { name: item.name })}
                hitSlop={8}
                icon={<PlusIcon className="size-5 text-foreground" />}
                onPress={() => createTemplate(item, language)}
                testID={`template-create-${item.id}`}
                variant="secondary"
              />
            }
            description={item.description}
            onPress={() => {
              if (!isFocused) return;
              Keyboard.dismiss();
              setPreview({ template: item, language, phase: 'open' });
            }}
            testID={`template-${item.id}`}
          >
            <MarketplaceItemContent
              description={item.description}
              leading={<AgentAvatar emoji={item.emoji} name={item.name} size={48} />}
              metadata={
                <Text className="text-xs text-muted-foreground">
                  {item.categories.length
                    ? item.categories
                        .map((value) => t(AGENT_TEMPLATE_CATEGORY_KEYS[value]))
                        .join(' · ')
                    : item.group.join(' · ')}
                </Text>
              }
              title={item.name}
            />
          </MarketplaceItem>
        )}
        testID="marketplace-templates"
      />
      {preview ? (
        <BottomSheet
          active={isFocused}
          closeAction={{ accessibilityLabel: t('common.close') }}
          footer={
            <Button
              onPress={() =>
                setPreview((current) => (current ? { ...current, phase: 'creating' } : null))
              }
              size="footer"
              testID="template-create"
            >
              {t('marketplace.templates.create')}
            </Button>
          }
          onClose={() =>
            setPreview((current) => (current ? { ...current, phase: 'closing' } : null))
          }
          onClosed={finishPreview}
          open={isFocused && preview.phase === 'open'}
          size="content"
          testID="template-preview"
          title={t('marketplace.templates.details')}
        >
          <View className="px-5 pt-5 pb-6">
            <AgentTemplateDetails template={preview.template} />
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
}
