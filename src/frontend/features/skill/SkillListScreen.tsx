import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { useSkillsApi } from '@/frontend/hooks/skill';
import { effectiveSkillStatus, skillStatusTone } from '@/frontend/utils/skillStatus';
import type { SkillListItem } from '@/shared/data/types/skill';

import { SkillPage } from './SkillPage';
import { useStartSkillChat } from './useStartSkillChat';

const STATUS_TEXT_CLASS = {
  danger: 'text-error',
  default: 'text-muted-foreground',
  success: 'text-success',
} as const;

export function SkillListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isOpening, open } = useStartSkillChat();
  const { open: openSearch } = useAppSearch();
  const apiClient = useApiClient();
  const { error, isLoading, refetch, skills, hasNext, loadNext, isLoadingMore } = useSkillsApi({
    scope: 'library',
  });

  function openSkill(skill: SkillListItem) {
    router.push({ pathname: '/skills/[skillId]', params: { skillId: skill.id } });
  }

  function searchSkills() {
    void openSearch<SkillListItem>({
      emptyText: t('skills.searchEmpty'),
      getAccessibilityLabel: (skill) => skill.name,
      keyExtractor: (skill) => skill.id,
      loadRecent: async ({ signal }) => {
        const page = await apiClient.get('/skills', {
          query: { scope: 'library', limit: 10 },
          signal,
        });
        return { groups: [{ key: 'installed', items: page.items }] };
      },
      placeholder: t('skills.search'),
      renderItem: (skill) => (
        <View className="gap-0.5 py-3">
          <Text className="text-base text-foreground">{skill.name}</Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {skill.description}
          </Text>
        </View>
      ),
      search: async ({ cursor, query, signal }) => {
        const page = await apiClient.get('/skills', {
          query: { scope: 'library', search: query, cursor },
          signal,
        });
        return { groups: [{ key: 'installed', items: page.items }], nextCursor: page.nextCursor };
      },
    }).then((outcome) => {
      if (outcome.type === 'selected') openSkill(outcome.item);
    });
  }

  return (
    <SkillPage
      headerProps={{
        title: t('skills.title'),
        rightActions: [
          {
            accessibilityLabel: t('skills.search'),
            icon: SearchIcon,
            key: 'skill-search',
            onPress: searchSkills,
            testID: 'skills-search',
            type: 'icon',
          },
          {
            accessibilityLabel: t('common.more'),
            disabled: isOpening,
            icon: EllipsisIcon,
            key: 'skill-actions',
            testID: 'skills-more',
            type: 'menu',
            items: [
              {
                id: 'skill-add-chat',
                label: t('skills.addInChat'),
                onPress: () => void open(),
              },
              {
                id: 'skill-discover',
                label: t('skills.discover.title'),
                onPress: () => router.push('/skills/discover'),
              },
            ],
          },
        ],
      }}
      testID="skills-list"
    >
      {isLoading ? (
        <View className="flex-1 justify-center">
          <ContentState.Loading title={t('skills.loading')} />
        </View>
      ) : error ? (
        <View className="flex-1 justify-center">
          <ContentState.Error
            primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
            title={t('skills.loadFailed')}
          />
        </View>
      ) : skills.length === 0 ? (
        <View className="flex-1 justify-center">
          <ContentState.Empty
            description={t('skills.installedEmptyHint')}
            primaryAction={{
              children: t('skills.add'),
              disabled: isOpening,
              loading: isOpening,
              onPress: () => void open(),
              testID: 'skills-empty-add',
            }}
            prominence="prominent"
            title={t('skills.installedEmpty')}
          />
        </View>
      ) : (
        <Section>
          {skills.map((skill) => (
            <InstalledSkillRow key={skill.id} onPress={() => openSkill(skill)} skill={skill} />
          ))}
        </Section>
      )}
      {hasNext ? (
        <Button disabled={isLoadingMore} onPress={() => void loadNext()} variant="ghost">
          {t('skills.loadMore')}
        </Button>
      ) : null}
    </SkillPage>
  );
}

function InstalledSkillRow({ onPress, skill }: { onPress: () => void; skill: SkillListItem }) {
  const { t } = useTranslation();
  const status = effectiveSkillStatus(skill.admission, skill.agentAdmission);
  const tone = skillStatusTone(status);
  return (
    <Section.Item
      accessibilityLabel={`${skill.name}, ${t(`skills.status.${status}`)}`}
      description={
        <View className="gap-0.5">
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {skill.description}
          </Text>
          <Text className={`text-xs ${STATUS_TEXT_CLASS[tone]}`}>
            {skill.isEnabled ? t(`skills.status.${status}`) : t('skills.status.disabled')}
          </Text>
        </View>
      }
      label={skill.name}
      onPress={onPress}
      testID={`skill-${skill.id}`}
      trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
    />
  );
}
