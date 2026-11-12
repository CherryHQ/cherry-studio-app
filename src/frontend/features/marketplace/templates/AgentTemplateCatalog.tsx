import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { Button, ContentState, SearchField, Tabs } from '@cherrystudio/ui/components';
import { useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInlineSearch } from '@/frontend/components/InlineSearch';
import {
  type AgentTemplate,
  type AgentTemplateCategory,
  getAgentTemplates,
} from '@/shared/data/presets/agentTemplates';

import { AGENT_TEMPLATE_CATEGORY_KEYS } from './templateCategories';

export function AgentTemplateCatalog() {
  const { t, i18n } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [category, setCategory] = useState<AgentTemplateCategory | 'all'>('all');
  const { query, setQuery, results } = useInlineSearch({
    items: getAgentTemplates(language),
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
  const rows: AgentTemplate[][] = [];
  for (let index = 0; index < filtered.length; index += 2)
    rows.push(filtered.slice(index, index + 2));

  return (
    <View className="flex-1 gap-3">
      <View className="px-4">
        <SearchField
          accessibilityLabel={t('marketplace.templates.search')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder={t('marketplace.templates.search')}
          value={query}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0"
        contentContainerClassName="px-4"
      >
        <Tabs
          items={[
            { value: 'all', label: t('marketplace.category.all') },
            ...Object.entries(AGENT_TEMPLATE_CATEGORY_KEYS).map(([value, key]) => ({
              value: value as AgentTemplateCategory,
              label: t(key),
            })),
          ]}
          layout="hug"
          onValueChange={setCategory}
          value={category}
          variant="chips"
        />
      </ScrollView>
      <View className="flex-row flex-wrap items-center justify-between gap-2 px-4">
        <Text className="font-semibold text-lg text-foreground">
          {t('marketplace.templates.title')}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {t('marketplace.templates.count', { count: filtered.length })}
        </Text>
      </View>
      <FlatList
        key={`${category}:${query}`}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 12 }}
        contentInsetAdjustmentBehavior="never"
        data={rows}
        initialNumToRender={6}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(row) => row[0]!.id}
        ListEmptyComponent={<ContentState.Empty title={t('marketplace.templates.empty')} />}
        renderItem={({ item: row }) => (
          <View className="flex-row gap-3">
            {row.map((template) => (
              <AgentTemplateCard key={template.id} language={language} template={template} />
            ))}
            {row.length === 1 ? <View className="flex-1" /> : null}
          </View>
        )}
        testID="marketplace-templates"
      />
    </View>
  );
}

function AgentTemplateCard({ template, language }: { template: AgentTemplate; language: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const category = template.categories[0];

  return (
    <View className="flex-1 overflow-hidden rounded-2xl bg-card">
      <Pressable
        accessibilityLabel={t('marketplace.templates.preview', { name: template.name })}
        accessibilityRole="button"
        className="flex-1 gap-2 p-4 pb-2 active:opacity-70"
        onPress={() =>
          router.push({
            pathname: '/skills/templates/[templateId]',
            params: { templateId: template.id, templateLanguage: language },
          })
        }
        testID={`template-${template.id}`}
      >
        <Text className="text-3xl" accessibilityElementsHidden>
          {template.emoji}
        </Text>
        <Text className="font-semibold text-base text-foreground" numberOfLines={2}>
          {template.name}
        </Text>
        <Text className="text-sm text-muted-foreground" numberOfLines={3}>
          {template.description}
        </Text>
      </Pressable>
      <View className="flex-row items-center justify-between gap-2 px-4 pb-3">
        <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
          {category ? t(AGENT_TEMPLATE_CATEGORY_KEYS[category]) : template.group[0]}
        </Text>
        <Button
          accessibilityLabel={t('marketplace.templates.use', { name: template.name })}
          icon={<PlusIcon className="size-5 text-foreground" />}
          onPress={() => {
            if (navigation.isFocused())
              router.push({
                pathname: '/agents/new',
                params: { templateId: template.id, templateLanguage: language, startChat: 'true' },
              });
          }}
          shape="pill"
          size="sm"
          hitSlop={8}
          variant="secondary"
          testID={`template-create-${template.id}`}
        />
      </View>
    </View>
  );
}
