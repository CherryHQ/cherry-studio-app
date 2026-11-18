import { Tabs } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { InlineSearch } from '@/frontend/components/InlineSearch';

import {
  MarketplaceAgentLibraryPreview,
  MarketplaceSkillLibraryPreview,
} from './components/MarketplaceLibraryPreview';
import { MarketplaceSkills } from './skills/MarketplaceSkills';
import { AgentTemplateCatalog } from './templates/AgentTemplateCatalog';

type MarketTab = 'skills' | 'agents';

export function MarketplaceScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MarketTab>('skills');
  // Each catalog keeps its own query, so switching back finds the previous search intact.
  const [queries, setQueries] = useState<Record<MarketTab, string>>({ skills: '', agents: '' });

  const query = queries[tab];
  const isSkills = tab === 'skills';
  const browseHeader = query.trim() ? null : (
    <View className="gap-4">
      {isSkills ? <MarketplaceSkillLibraryPreview /> : <MarketplaceAgentLibraryPreview />}
      <Text accessibilityRole="header" className="px-4 text-base font-medium text-muted-foreground">
        {t('marketplace.discover')}
      </Text>
    </View>
  );

  function changeQuery(value: string) {
    setQueries((current) => ({ ...current, [tab]: value }));
  }

  return (
    <>
      <RouteHeader title={t('marketplace.title')} />
      <View className="flex-1 bg-background">
        <InlineSearch onChangeText={changeQuery} value={query} />
        <View className="px-4 pt-2 pb-2">
          <Tabs
            accessibilityLabel={t('marketplace.title')}
            items={[
              { value: 'skills', label: t('skills.title'), testID: 'marketplace-tab-skills' },
              { value: 'agents', label: t('navigation.agents'), testID: 'marketplace-tab-agents' },
            ]}
            layout="hug"
            onValueChange={setTab}
            value={tab}
            variant="pill"
          />
        </View>
        {isSkills ? (
          <MarketplaceSkills browseHeader={browseHeader} query={query} />
        ) : (
          <AgentTemplateCatalog browseHeader={browseHeader} query={query} />
        )}
      </View>
    </>
  );
}
