import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { isSkillsError, SkillsError, type SkillInspection } from '@/shared/contracts/skills';

import { SkillDocumentPage } from './SkillDocumentPage';
import { SkillLimitationList } from './SkillLimitationList';
import { SkillPage } from './SkillPage';

export function SkillCandidateScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    candidateId?: string | string[];
    url?: string | string[];
    name?: string | string[];
    description?: string | string[];
  }>();
  const candidateId = getSingleRouteParam(params.candidateId) ?? '';
  const url = getSingleRouteParam(params.url) ?? '';
  const name = getSingleRouteParam(params.name);
  const description = getSingleRouteParam(params.description);
  const queryKey = ['skills', 'inspect', candidateId || url];
  const skillsModule = useBackendModule('skills');
  const inspection = useQuery({
    enabled: Boolean(candidateId || url),
    queryFn: async ({ signal }) => {
      if (candidateId) return skillsModule.inspect(candidateId, signal);
      const candidates = await skillsModule.resolve(url, signal);
      signal.throwIfAborted();
      if (candidates.length !== 1) {
        throw new SkillsError(
          candidates.length === 0 ? 'not-found' : 'source-invalid',
          'The selected listing must resolve to exactly one Skill.',
        );
      }
      return skillsModule.inspect(candidates[0]!.candidateId, signal);
    },
    queryKey,
    retry: false,
    staleTime: 60_000,
  });
  const refetch = inspection.refetch;
  useFocusEffect(
    useCallback(() => {
      if (candidateId || url) void refetch();
    }, [candidateId, refetch, url]),
  );

  if (inspection.isLoading) {
    return (
      <SkillPage headerProps={{ title: name ?? t('skills.candidate.title') }}>
        {description ? <Text className="text-base text-foreground">{description}</Text> : null}
        <ContentState.Loading layout="row" title={t('skills.loading')} />
      </SkillPage>
    );
  }
  if (inspection.isError || !inspection.data) {
    const code = isSkillsError(inspection.error) ? inspection.error.code : 'source-unreachable';
    return (
      <SkillPage headerProps={{ title: name ?? t('skills.candidate.title') }}>
        <ContentState.Error
          primaryAction={{ children: t('common.retry'), onPress: () => void inspection.refetch() }}
          title={t(`skills.error.${code}`)}
        />
      </SkillPage>
    );
  }
  return <SkillCandidate inspection={inspection.data} />;
}

function SkillCandidate({ inspection }: { inspection: SkillInspection }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const skillsModule = useBackendModule('skills');
  const [isInstalling, setIsInstalling] = useState(false);
  const { candidate, issues, limitations, package: pkg } = inspection;

  async function install() {
    setIsInstalling(true);
    try {
      const skill = await skillsModule.install({ candidateId: candidate.candidateId });
      toast.show({ label: t('skills.toast.installed'), variant: 'success' });
      router.replace({ pathname: '/skills/[skillId]', params: { skillId: skill.id } });
    } catch (error) {
      const code = isSkillsError(error) ? error.code : 'source-unreachable';
      toast.show({ label: t(`skills.error.${code}`), variant: 'danger' });
    } finally {
      setIsInstalling(false);
    }
  }

  const headerProps = { title: pkg?.name ?? candidate.name };
  const installAction = candidate.installedSkillId ? (
    <Button
      onPress={() =>
        router.replace({
          pathname: '/skills/[skillId]',
          params: { skillId: candidate.installedSkillId! },
        })
      }
      size="lg"
      variant="secondary"
    >
      {t('skills.candidate.openInstalled')}
    </Button>
  ) : pkg ? (
    <Button disabled={isInstalling} onPress={() => void install()} size="lg">
      {isInstalling ? t('skills.candidate.installing') : t('skills.candidate.install')}
    </Button>
  ) : null;

  if (pkg) {
    return (
      <SkillDocumentPage
        contentHash={pkg.contentHash}
        description={pkg.description}
        headerProps={headerProps}
        instructions={pkg.instructions}
      >
        {installAction}
        {limitations ? <SkillLimitationList limitations={limitations} /> : null}
      </SkillDocumentPage>
    );
  }

  return (
    <SkillPage headerProps={headerProps}>
      {installAction}
      <View className="gap-3">
        <Text className="text-base text-foreground">{candidate.description}</Text>
        <Text className="text-sm text-error">{t('skills.candidate.invalidPackage')}</Text>
        {issues.map((issue) => (
          <Text
            className="text-sm text-muted-foreground"
            key={`${issue.code}:${issue.subject ?? ''}`}
          >
            {t(`skills.issue.${issue.code}`, { subject: issue.subject ?? '' })}
          </Text>
        ))}
      </View>
    </SkillPage>
  );
}
