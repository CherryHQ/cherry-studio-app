import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState, Input, Section, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useRecommendedSkills } from '@/frontend/hooks/skill';
import { isSkillsError } from '@/shared/contracts/skills';
import type { SkillCandidate } from '@/shared/data/types/skill';

import { SkillAiDiscovery } from './SkillAiDiscovery';
import { SkillPage } from './SkillPage';

export function SkillDiscoveryScreen() {
  const { t } = useTranslation();
  return (
    <SkillPage headerProps={{ title: t('skills.tabs.discover') }}>
      <DiscoverSkills />
    </SkillPage>
  );
}

function DiscoverSkills() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const skillsModule = useBackendModule('skills');
  const recommended = useRecommendedSkills();
  const [url, setUrl] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const openCandidate = useCallback(
    (candidate: SkillCandidate) => {
      router.push({
        pathname: '/plugins/skills/candidate',
        params: { candidateId: candidate.candidateId },
      });
    },
    [router],
  );
  const resolveUrl = useCallback(async () => {
    Keyboard.dismiss();
    setIsResolving(true);
    try {
      openCandidate(await skillsModule.resolveGithub(url.trim()));
    } catch (error) {
      const code = isSkillsError(error) ? error.code : 'source-unreachable';
      toast.show({ label: t(`skills.error.${code}`), variant: 'danger' });
    } finally {
      setIsResolving(false);
    }
  }, [openCandidate, skillsModule, t, toast, url]);

  return (
    <View className="gap-6">
      <SkillAiDiscovery onSelect={openCandidate} />
      <View className="gap-2">
        <Text className="px-1 font-medium text-muted-foreground text-sm">
          {t('skills.github.title')}
        </Text>
        <Input
          accessibilityLabel={t('skills.github.placeholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setUrl}
          onSubmitEditing={() => void resolveUrl()}
          placeholder={t('skills.github.placeholder')}
          returnKeyType="go"
          value={url}
        />
        <Text className="px-1 text-muted-foreground text-xs">{t('skills.github.hint')}</Text>
        <Button disabled={!url.trim() || isResolving} onPress={() => void resolveUrl()} size="sm">
          {isResolving ? t('skills.github.resolving') : t('skills.github.resolve')}
        </Button>
      </View>
      <View className="gap-2">
        <Text className="px-1 font-medium text-muted-foreground text-sm">
          {t('skills.recommended.title')}
        </Text>
        {recommended.isLoading ? <ContentState.Loading title={t('skills.loading')} /> : null}
        {recommended.isError ? (
          <ContentState.Error
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void recommended.refetch(),
            }}
            title={t('skills.loadFailed')}
          />
        ) : null}
        {recommended.data ? (
          <Section>
            {recommended.data.map((candidate) => (
              <Section.Item
                accessibilityLabel={candidate.name}
                description={
                  <View className="gap-0.5">
                    <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                      {candidate.description}
                    </Text>
                    {candidate.installedSkillId ? (
                      <Text className="text-xs text-success">
                        {t('skills.recommended.installed')}
                      </Text>
                    ) : null}
                  </View>
                }
                key={candidate.candidateId}
                label={candidate.name}
                onPress={() => openCandidate(candidate)}
                testID={`skill-candidate-${candidate.name}`}
                trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
              />
            ))}
          </Section>
        ) : null}
      </View>
    </View>
  );
}
