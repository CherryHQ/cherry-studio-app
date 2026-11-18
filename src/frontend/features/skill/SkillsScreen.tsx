import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { RouteHeaderProps } from '@/frontend/appShell/header';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { SkillLibraryTab, useSkillLibrarySearch } from './SkillLibraryTab';
import { SkillPage } from './SkillPage';
import { useStartSkillChat } from './useStartSkillChat';

/** Installed Skills are managed separately from marketplace discovery. */
export function SkillsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    sessionId?: string | string[];
  }>();
  const { isAvailable: canAddInChat, isOpening, open } = useStartSkillChat();
  const searchLibrary = useSkillLibrarySearch();

  const headerProps: RouteHeaderProps = {
    title: t('skills.library'),
    rightActions: [
      {
        accessibilityLabel: t('skills.search'),
        icon: SearchIcon,
        key: 'skill-search',
        nativeIcon: require('@/assets/header-toolbar/search.png'),
        onPress: searchLibrary,
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
    <SkillPage headerProps={headerProps} testID="skills-list">
      <SkillLibraryTab
        onDiscover={() =>
          router.navigate({
            pathname: '/skills',
            params: {
              agentId: getSingleRouteParam(params.agentId),
              sessionId: getSingleRouteParam(params.sessionId),
            },
          })
        }
      />
    </SkillPage>
  );
}
