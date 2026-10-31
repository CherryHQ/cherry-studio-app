import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Tabs } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RouteHeaderProps } from '@/frontend/appShell/header';

import type { SkillDiscoverySource } from './discover/skillDiscovery';
import { SkillDiscoveryTab, useSkillDiscoverySearch } from './SkillDiscoveryTab';
import { SkillLibraryTab, useSkillLibrarySearch } from './SkillLibraryTab';
import { SkillPage } from './SkillPage';
import { useStartSkillChat } from './useStartSkillChat';

type SkillTab = 'library' | 'discover';

/** Installed and discoverable skills share one page; only the content below the tabs changes. */
export function SkillsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SkillTab>('library');
  const [source, setSource] = useState<SkillDiscoverySource>('cherryin');
  const { isAvailable: canAddInChat, isOpening, open } = useStartSkillChat();
  const searchLibrary = useSkillLibrarySearch();
  const searchDiscovery = useSkillDiscoverySearch(source);

  const headerProps: RouteHeaderProps = {
    title: t('skills.title'),
    rightActions: [
      {
        accessibilityLabel: t(tab === 'library' ? 'skills.search' : 'skills.discover.search'),
        icon: SearchIcon,
        key: 'skill-search',
        nativeIcon: require('@/assets/header-toolbar/search.png'),
        onPress: tab === 'library' ? searchLibrary : searchDiscovery,
        testID: 'skills-search',
        type: 'icon',
      },
      ...(canAddInChat
        ? [
            {
              accessibilityLabel: t('common.more'),
              disabled: isOpening,
              icon: EllipsisIcon,
              key: 'skill-actions',
              nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
              testID: 'skills-more',
              type: 'menu' as const,
              items: [
                {
                  id: 'skill-create',
                  label: t('skills.create.name'),
                  onPress: () => void open('create'),
                },
                {
                  id: 'skill-add-chat',
                  label: t('skills.addInChat'),
                  onPress: () => void open(),
                },
              ],
            },
          ]
        : []),
    ],
  };

  return (
    <SkillPage
      contentClassName={tab === 'discover' ? 'gap-2' : undefined}
      headerProps={headerProps}
      testID="skills-list"
    >
      <Tabs
        items={[
          { value: 'library', label: t('skills.library'), testID: 'skills-tab-library' },
          { value: 'discover', label: t('skills.discover.tab'), testID: 'skills-tab-discover' },
        ]}
        onValueChange={setTab}
        value={tab}
      />
      {tab === 'library' ? (
        <SkillLibraryTab onDiscover={() => setTab('discover')} />
      ) : (
        <SkillDiscoveryTab onSourceChange={setSource} source={source} />
      )}
    </SkillPage>
  );
}
