import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { ActionMenu, Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SkillDiscoverySource } from './skillDiscovery';
import { SkillDiscoveryTab, useSkillDiscoverySearch } from './SkillDiscoveryTab';

export function MarketplaceSkills() {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [source, setSource] = useState<SkillDiscoverySource>('cherryin');
  const search = useSkillDiscoverySearch(source);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      testID="marketplace-skills"
    >
      {/* Remote, paginated search uses the shared search route, retaining URL imports. */}
      <Pressable
        accessibilityLabel={t('skills.discover.search')}
        accessibilityRole="button"
        className="min-h-12 flex-row items-center gap-3 rounded-xl bg-secondary px-4 py-3 active:opacity-70"
        onPress={search}
        testID="marketplace-skills-search"
      >
        <SearchIcon className="size-5 text-muted-foreground" />
        <Text className="flex-1 text-base text-muted-foreground">
          {t('marketplace.skills.search')}
        </Text>
      </Pressable>
      <View className="flex-row items-center pt-3">
        <ActionMenu
          items={[
            {
              id: 'cherryin',
              label: 'CherryIN',
              checked: source === 'cherryin',
              onPress: () => setSource('cherryin'),
            },
            {
              id: 'skills-sh',
              label: 'skills.sh',
              checked: source === 'skills-sh',
              onPress: () => setSource('skills-sh'),
            },
          ]}
        >
          <Button
            accessibilityLabel={t('skills.marketplace.source')}
            accessibilityValue={{ text: source === 'cherryin' ? 'CherryIN' : 'skills.sh' }}
            hitSlop={8}
            size="inline"
            variant="ghost"
            testID="marketplace-skill-source"
          >
            <Button.Label>{source === 'cherryin' ? 'CherryIN' : 'skills.sh'}</Button.Label>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        </ActionMenu>
      </View>
      <SkillDiscoveryTab source={source} onSourceChange={setSource} />
    </ScrollView>
  );
}
