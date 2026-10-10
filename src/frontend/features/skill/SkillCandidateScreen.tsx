import { Button, ContentState, Section, useToast } from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { skillStatusTone } from '@/frontend/utils/skillStatus';
import { isSkillsError, SkillsError, type SkillInspection } from '@/shared/contracts/skills';

import { SkillPage } from './SkillPage';
import { SkillReasonList } from './SkillReasonList';

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
  return <SkillCandidate inspection={inspection.data} queryKey={queryKey} />;
}

function SkillCandidate({
  inspection,
  queryKey,
}: {
  inspection: SkillInspection;
  queryKey: readonly string[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const skillsModule = useBackendModule('skills');
  const [isInstalling, setIsInstalling] = useState(false);
  const queryClient = useQueryClient();

  const { admission, candidate, issues, package: pkg } = inspection;
  const status = admission?.status ?? null;
  const tone = status ? skillStatusTone(status) : 'danger';
  const isInstalled = candidate.installedSkillId !== null;
  const canInstall = !isInstalled && pkg !== null;

  async function install() {
    setIsInstalling(true);
    try {
      const result = candidate.installedSkillId
        ? await skillsModule.update(candidate.installedSkillId)
        : {
            outcome: 'updated' as const,
            skill: await skillsModule.install({ candidateId: candidate.candidateId }),
          };
      if (result.outcome === 'rejected') {
        queryClient.setQueryData(queryKey, result.inspection);
        toast.show({ label: t('skills.toast.update.rejected'), variant: 'danger' });
        return;
      }
      const skill = result.skill;
      toast.show({
        label: t(
          candidate.installedSkillId
            ? `skills.toast.update.${result.outcome}`
            : 'skills.toast.installed',
        ),
        variant: 'success',
      });
      router.replace({ pathname: '/skills/[skillId]', params: { skillId: skill.id } });
    } catch (error) {
      const code = isSkillsError(error) ? error.code : 'source-unreachable';
      toast.show({ label: t(`skills.error.${code}`), variant: 'danger' });
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    <SkillPage headerProps={{ title: pkg?.name ?? candidate.name }}>
      <View className="gap-2">
        <Text className="text-base text-foreground" selectable>
          {pkg?.description ?? candidate.description}
        </Text>
        {status ? (
          <Text
            className={`text-sm ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-error' : 'text-muted-foreground'}`}
          >
            {t(`skills.status.${status}`)}
          </Text>
        ) : (
          <Text className="text-sm text-error">{t('skills.candidate.invalidPackage')}</Text>
        )}
        {inspection.profile?.workflowScope ? (
          <Text className="text-sm text-muted-foreground" selectable>
            {inspection.profile.workflowScope}
          </Text>
        ) : null}
        {admission ? <SkillReasonList reasons={admission.reasons} /> : null}
        {pkg?.compatibility ? (
          <Text className="text-sm text-muted-foreground" selectable>
            {pkg.compatibility}
          </Text>
        ) : null}
        {issues.length > 0 ? (
          <View className="gap-1">
            {issues.map((issue) => (
              <Text
                className="text-sm text-error"
                key={`${issue.code}:${issue.subject ?? ''}`}
                selectable
              >
                {t(`skills.issue.${issue.code}`, { subject: issue.subject ?? '' })}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Section title={t('skills.detail.about')}>
        <Section.Item
          label={t('skills.detail.source')}
          trailing={
            <Text className="text-sm text-muted-foreground">
              {t(`skills.source.${candidate.source.registry}`)}
            </Text>
          }
        />
        {candidate.author ? (
          <Section.Item
            label={t('skills.detail.author')}
            trailing={<Text className="text-sm text-muted-foreground">{candidate.author}</Text>}
          />
        ) : null}
        <Section.Item
          label={t('skills.detail.revision')}
          trailing={
            <Text className="text-sm text-muted-foreground">
              {candidate.source.revision.slice(0, 12)}
            </Text>
          }
        />
        {pkg ? (
          <Section.Item
            label={t('skills.detail.files')}
            trailing={
              <Text className="text-sm text-muted-foreground">{String(pkg.manifest.length)}</Text>
            }
          />
        ) : null}
        <Section.Item
          label={t('skills.detail.verification')}
          trailing={
            <Text className="text-sm text-muted-foreground">
              {t(`skills.provenance.${candidate.profileProvenance}`)}
            </Text>
          }
        />
      </Section>
      {pkg?.instructionsPreview ? (
        <Section title={t('skills.candidate.preview')}>
          <Section.Item>
            <Text className="text-sm text-muted-foreground" selectable>
              {pkg.instructionsPreview}
            </Text>
          </Section.Item>
        </Section>
      ) : null}
      {isInstalled && pkg !== null ? (
        <Button disabled={isInstalling} onPress={() => void install()}>
          {t('skills.candidate.applyUpdate')}
        </Button>
      ) : null}
      {isInstalled ? (
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
      ) : (
        <Button disabled={!canInstall || isInstalling} onPress={() => void install()} size="lg">
          {isInstalling ? t('skills.candidate.installing') : t('skills.candidate.install')}
        </Button>
      )}
      {pkg ? (
        <Text className="px-1 text-muted-foreground text-xs">{t('skills.executionHint')}</Text>
      ) : null}
    </SkillPage>
  );
}
