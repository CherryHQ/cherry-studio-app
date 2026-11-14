import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Button, Tabs } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SkillDiscoverySource } from './skillDiscovery';
import { SkillDiscoveryTab, useSkillDiscoverySearch } from './SkillDiscoveryTab';

export function MarketplaceSkills({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [source, setSource] = useState<SkillDiscoverySource>('cherryin');
  const search = useSkillDiscoverySearch(source);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      testID="marketplace-skills"
    >
      {/* Remote, paginated search uses the shared search route, retaining URL imports. */}
      <Pressable
        accessibilityLabel={t('skills.discover.search')}
        accessibilityRole="button"
        className="min-h-12 flex-row items-center gap-3 rounded-xl bg-card px-4 py-3 active:opacity-70"
        onPress={search}
      >
        <SearchIcon className="size-5 text-muted-foreground" />
        <Text className="flex-1 text-base text-muted-foreground">
          {t('marketplace.skills.search')}
        </Text>
      </Pressable>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Tabs
          accessibilityLabel={t('skills.marketplace.source')}
          items={[
            { value: 'cherryin', label: 'CherryIN' },
            { value: 'skills-sh', label: 'skills.sh' },
          ]}
          layout="hug"
          onValueChange={setSource}
          value={source}
          variant="chips"
        />
        <Button onPress={onOpenLibrary} size="sm" variant="ghost">
          {t('skills.library')}
        </Button>
      </View>
      <SkillDiscoveryTab source={source} onSourceChange={setSource} />
    </ScrollView>
  );
}
