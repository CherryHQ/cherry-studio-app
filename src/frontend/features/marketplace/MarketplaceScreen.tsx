import { Tabs } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const headerHeight = useHeaderHeight();
  const { bottom } = useSafeAreaInsets();
  const [tab, setTab] = useState<MarketTab>('skills');
  // Each catalog keeps its own query, so switching back finds the previous search intact.
  const [queries, setQueries] = useState<Record<MarketTab, string>>({ skills: '', agents: '' });

  const query = queries[tab];
  const isSkills = tab === 'skills';
  const placeholder = t(
    isSkills ? 'skills.marketplace.searchPlaceholder' : 'marketplace.templates.search',
  );
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
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight - bottom}
        style={styles.page}
      >
        <View className="flex-1 bg-background">
          <View className="px-4 pt-2 pb-2">
            <Tabs
              accessibilityLabel={t('marketplace.title')}
              items={[
                { value: 'skills', label: t('skills.title'), testID: 'marketplace-tab-skills' },
                {
                  value: 'agents',
                  label: t('navigation.agents'),
                  testID: 'marketplace-tab-agents',
                },
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
          <View className="px-4 pt-3" style={{ paddingBottom: bottom + 12 }}>
            <InlineSearch
              layout="embedded"
              onChangeText={changeQuery}
              placeholder={placeholder}
              value={query}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({ page: { flex: 1 } });
