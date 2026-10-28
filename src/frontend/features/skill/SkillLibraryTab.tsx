import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { ManagedBadge, useManagedLabel, withResourcePolicy } from '@/frontend/components/Policy';
import { useApiClient } from '@/frontend/data';
import { useSkillsApi } from '@/frontend/hooks/skill';
import { managedResourcePolicy } from '@/shared/data/managedPolicy';
import type { SkillListItem } from '@/shared/data/types/skill';

function useOpenSkill() {
  const router = useRouter();
  return (skill: SkillListItem) =>
    router.push({ pathname: '/skills/[skillId]', params: { skillId: skill.id } });
}

export function useSkillLibrarySearch() {
  const { t } = useTranslation();
  const { open: openSearch } = useAppSearch();
  const apiClient = useApiClient();
  const openSkill = useOpenSkill();

  return () =>
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

export function SkillLibraryTab({ onDiscover }: { onDiscover: () => void }) {
  const { t } = useTranslation();
  const openSkill = useOpenSkill();
  const { error, isLoading, refetch, skills, hasNext, loadNext, isLoadingMore } = useSkillsApi({
    scope: 'library',
  });

  return (
    <>
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
            title={t('skills.installedEmpty')}
            primaryAction={{ children: t('skills.discover.title'), onPress: onDiscover }}
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
    </>
  );
}

function InstalledSkillRowView({ onPress, skill }: { onPress: () => void; skill: SkillListItem }) {
  const { t } = useTranslation();
  return (
    <Section.Item
      accessibilityLabel={useManagedLabel(skill.name)}
      description={
        <View className="gap-0.5">
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {skill.description}
          </Text>
          {skill.isPackageMissing ? (
            <Text className="text-warning text-xs">{t('skills.packageMissing')}</Text>
          ) : null}
        </View>
      }
      label={
        <View className="min-w-0 flex-row items-center gap-2">
          <Text className="shrink text-base text-foreground">{skill.name}</Text>
          <ManagedBadge />
        </View>
      }
      onPress={onPress}
      testID={`skill-${skill.id}`}
      trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
    />
  );
}

/** Each row follows its own Skill's policy. */
const InstalledSkillRow = withResourcePolicy(InstalledSkillRowView, ({ skill }) =>
  managedResourcePolicy(skill),
);
