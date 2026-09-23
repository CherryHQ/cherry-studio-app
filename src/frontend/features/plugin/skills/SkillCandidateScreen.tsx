import { Button, ContentState, Section, useToast } from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { skillStatusTone } from '@/frontend/utils/skillStatus';
import { isSkillsError, type SkillInspection } from '@/shared/contracts/skills';

import { SkillAssessmentDetails } from './SkillAssessmentDetails';
import { SkillPage } from './SkillPage';
import { SkillReasonList } from './SkillReasonList';

export function SkillCandidateScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ candidateId?: string | string[] }>();
  const candidateId = getSingleRouteParam(params.candidateId) ?? '';
  const skillsModule = useBackendModule('skills');
  const inspection = useQuery({
    enabled: Boolean(candidateId),
    queryFn: ({ signal }) => skillsModule.inspect(candidateId, signal),
    queryKey: ['skills', 'inspect', candidateId],
    retry: false,
    staleTime: 60_000,
  });
  const refetch = inspection.refetch;
  useFocusEffect(
    useCallback(() => {
      if (candidateId) void refetch();
    }, [candidateId, refetch]),
  );

  if (inspection.isLoading) {
    return (
      <SkillPage headerProps={{ title: t('skills.candidate.title') }}>
        <ContentState.Loading title={t('skills.candidate.inspecting')} />
      </SkillPage>
    );
  }
  if (inspection.isError || !inspection.data) {
    const code = isSkillsError(inspection.error) ? inspection.error.code : 'source-unreachable';
    return (
      <SkillPage headerProps={{ title: t('skills.candidate.title') }}>
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
  const [isAssessing, setIsAssessing] = useState(false);
  const queryClient = useQueryClient();
  const assessmentController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      assessmentController.current?.abort();
      assessmentController.current = null;
    },
    [],
  );

  async function assess() {
    if (isAssessing) return;
    const controller = new AbortController();
    assessmentController.current = controller;
    setIsAssessing(true);
    const queryKey = ['skills', 'inspect', inspection.candidate.candidateId];
    try {
      await queryClient.cancelQueries({ queryKey });
      const result = await skillsModule.assess(inspection.candidate.candidateId, controller.signal);
      if (!controller.signal.aborted) queryClient.setQueryData(queryKey, result);
    } catch (error) {
      if (!controller.signal.aborted)
        toast.show({
          label: t(`skills.error.${isSkillsError(error) ? error.code : 'ai-unavailable'}`),
          variant: 'danger',
        });
    } finally {
      if (assessmentController.current === controller) {
        assessmentController.current = null;
        setIsAssessing(false);
      }
    }
  }
  const { admission, candidate, issues, package: pkg } = inspection;
  const status = admission?.status ?? null;
  const tone = status ? skillStatusTone(status) : 'danger';
  const isInstalled = candidate.installedSkillId !== null;
  const canInstall = !isInstalled && pkg !== null && status === 'ready';

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
        queryClient.setQueryData(['skills', 'inspect', candidate.candidateId], result.inspection);
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
      router.replace({ pathname: '/plugins/skills/[skillId]', params: { skillId: skill.id } });
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
              {candidate.source.discovery?.registry ??
                t(`skills.source.${candidate.source.registry}`)}
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
      {pkg && candidate.source.registry !== 'bundled' ? (
        <View className="gap-2">
          <Text className="text-xs text-muted-foreground">{t('skills.ai.assessHint')}</Text>
          <Button
            disabled={isAssessing || isInstalling}
            onPress={() => void assess()}
            variant="secondary"
          >
            {t(isAssessing ? 'skills.ai.assessing' : 'skills.ai.assess')}
          </Button>
          {isAssessing ? (
            <Button variant="ghost" onPress={() => assessmentController.current?.abort()}>
              {t('common.cancel')}
            </Button>
          ) : null}
        </View>
      ) : null}
      {inspection.profile?.assessment ? (
        <SkillAssessmentDetails
          assessment={inspection.profile.assessment}
          adaptation={inspection.profile.adaptation}
        />
      ) : null}
      {isInstalled && status === 'ready' ? (
        <Button disabled={isInstalling || isAssessing} onPress={() => void install()}>
          {t('skills.ai.applyUpdate')}
        </Button>
      ) : null}
      {isInstalled ? (
        <Button
          onPress={() =>
            router.replace({
              pathname: '/plugins/skills/[skillId]',
              params: { skillId: candidate.installedSkillId! },
            })
          }
          size="lg"
          variant="secondary"
        >
          {t('skills.candidate.openInstalled')}
        </Button>
      ) : (
        <Button
          disabled={!canInstall || isInstalling || isAssessing}
          onPress={() => void install()}
          size="lg"
        >
          {isInstalling ? t('skills.candidate.installing') : t('skills.candidate.install')}
        </Button>
      )}
      {status === 'unknown' ? (
        <Text className="px-1 text-muted-foreground text-xs">
          {t('skills.candidate.unverifiedMessage')}
        </Text>
      ) : null}
      {status === 'unsupported' ? (
        <Text className="px-1 text-muted-foreground text-xs">
          {t('skills.candidate.unsupportedHint')}
        </Text>
      ) : null}
    </SkillPage>
  );
}
