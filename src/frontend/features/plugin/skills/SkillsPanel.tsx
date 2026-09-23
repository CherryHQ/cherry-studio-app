import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState, Input, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useSkillsApi } from '@/frontend/hooks/skill';
import { effectiveSkillStatus, skillStatusTone } from '@/frontend/utils/skillStatus';
import type { SkillListItem } from '@/shared/data/types/skill';

import { useStartSkillChat } from './useStartSkillChat';

const STATUS_TEXT_CLASS = {
  danger: 'text-error',
  default: 'text-muted-foreground',
  success: 'text-success',
} as const;

export function SkillsPanel() {
  const { t } = useTranslation();
  const { isOpening, open } = useStartSkillChat();
  return (
    <View className="gap-6">
      <Button
        loading={isOpening}
        disabled={isOpening}
        onPress={() => void open()}
        testID="skills-add"
      >
        {t('skills.add')}
      </Button>
      <InstalledSkills />
    </View>
  );
}

function InstalledSkills() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { error, isLoading, refetch, skills, hasNext, loadNext, isLoadingMore } = useSkillsApi({
    scope: 'library',
    search,
  });

  return (
    <View className="gap-4">
      <Input
        accessibilityLabel={t('skills.search')}
        placeholder={t('skills.search')}
        value={search}
        onChangeText={setSearch}
      />
      {isLoading ? (
        <ContentState.Loading title={t('skills.loading')} />
      ) : error ? (
        <ContentState.Error
          primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
          title={t('skills.loadFailed')}
        />
      ) : skills.length === 0 ? (
        <ContentState.Empty
          description={t('skills.installedEmptyHint')}
          title={t('skills.installedEmpty')}
        />
      ) : (
        <Section>
          {skills.map((skill) => (
            <InstalledSkillRow
              key={skill.id}
              onPress={() =>
                router.push({
                  pathname: '/plugins/skills/[skillId]',
                  params: { skillId: skill.id },
                })
              }
              skill={skill}
            />
          ))}
        </Section>
      )}
      {hasNext ? (
        <Button disabled={isLoadingMore} onPress={() => void loadNext()} variant="ghost">
          {t('skills.loadMore')}
        </Button>
      ) : null}
    </View>
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
            {skill.isGlobalEnabled ? t(`skills.status.${status}`) : t('skills.status.disabled')}
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
