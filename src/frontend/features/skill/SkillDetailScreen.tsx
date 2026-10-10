import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import {
  BottomSheet,
  Button,
  ContentState,
  Section,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSkillApiById, useSkillInstructionsApi } from '@/frontend/hooks/skill';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { skillStatusTone } from '@/frontend/utils/skillStatus';
import { isSkillsError } from '@/shared/contracts/skills';
import { type SkillListItem, skillContentHashHex } from '@/shared/data/types/skill';

import { SkillPage } from './SkillPage';
import { SkillReasonList } from './SkillReasonList';

const logger = loggerService.withContext('SkillDetailScreen');

export function SkillDetailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ skillId?: string | string[] }>();
  const skillId = getSingleRouteParam(params.skillId);
  const { error, isLoading, refetch, skill } = useSkillApiById(skillId);
  useFocusEffect(
    useCallback(() => {
      if (skillId) void refetch();
    }, [refetch, skillId]),
  );

  if (isLoading) {
    return (
      <SkillPage headerProps={{ title: t('skills.detail.title') }}>
        <ContentState.Loading title={t('skills.loading')} />
      </SkillPage>
    );
  }
  if (!skill || error) {
    return (
      <SkillPage headerProps={{ title: t('skills.detail.title') }}>
        <ContentState.Error
          primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
          title={t('skills.notFound')}
        />
      </SkillPage>
    );
  }
  return <SkillDetail key={skill.id} skill={skill} />;
}

function SkillDetail({ skill }: { skill: SkillListItem }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const skillsModule = useBackendModule('skills');
  const [isBusy, setIsBusy] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const instructions = useSkillInstructionsApi(skill.id, showInstructions);
  const status = skill.admission.status;
  const tone = skillStatusTone(status);

  async function checkForUpdates() {
    setIsBusy(true);
    try {
      const result = await skillsModule.update(skill.id);
      if (result.outcome === 'rejected') {
        router.push({
          pathname: '/skills/candidate',
          params: { candidateId: result.inspection.candidate.candidateId },
        });
      }
      toast.show({
        label: t(`skills.toast.update.${result.outcome}`),
        variant: result.outcome === 'rejected' ? 'danger' : 'success',
      });
    } catch (error) {
      const code = isSkillsError(error) ? error.code : 'source-unreachable';
      toast.show({ label: t(`skills.error.${code}`), variant: 'danger' });
    } finally {
      setIsBusy(false);
    }
  }

  async function uninstall() {
    setIsBusy(true);
    try {
      await skillsModule.uninstall(skill.id);
      toast.show({ label: t('skills.toast.uninstalled'), variant: 'success' });
      router.back();
    } catch (error) {
      logger.error('Failed to uninstall Skill', error as Error, { skillId: skill.id });
      toast.show({ label: t('skills.toast.uninstallFailed'), variant: 'danger' });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <SkillPage
      headerProps={{
        rightActions: [
          {
            accessibilityLabel: t('common.more'),
            disabled: isBusy,
            icon: EllipsisIcon,
            items: [
              {
                id: 'skill-update',
                label: t('skills.detail.checkUpdates'),
                onPress: () => void checkForUpdates(),
              },
              ...(skill.sourceUrl
                ? [
                    {
                      id: 'skill-source',
                      label: t('skills.detail.openSource'),
                      onPress: () => void openExternalUrl(skill.sourceUrl!),
                    },
                  ]
                : []),
              {
                destructive: true,
                id: 'skill-uninstall',
                label: t('skills.detail.uninstall'),
                onPress: () =>
                  alert.confirm({
                    confirmLabel: t('skills.detail.uninstall'),
                    description: t('skills.detail.uninstallMessage'),
                    onConfirm: () => void uninstall(),
                    role: 'destructive',
                    title: t('skills.detail.uninstallTitle', { name: skill.name }),
                  }),
              },
            ],
            key: 'skill-actions',
            type: 'menu',
          },
        ],
        title: skill.name,
      }}
    >
      <View className="gap-2">
        <Text className="text-base text-foreground" selectable>
          {skill.description}
        </Text>
        <Text
          className={`text-sm ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-error' : 'text-muted-foreground'}`}
        >
          {t(`skills.status.${status}`)}
        </Text>
        {skill.profile.workflowScope ? (
          <Text className="text-sm text-muted-foreground" selectable>
            {skill.profile.workflowScope}
          </Text>
        ) : null}
        <SkillReasonList reasons={skill.admission.reasons} />
        <Text className="text-sm text-muted-foreground">{t('skills.executionHint')}</Text>
      </View>
      <Section title={t('skills.detail.about')}>
        <Section.Item
          label={t('skills.detail.instructions')}
          onPress={() => setShowInstructions(true)}
        />
        <Section.Item
          label={t('skills.detail.source')}
          trailing={
            <Text className="text-sm text-muted-foreground">
              {t(skill.source === 'builtin' ? 'skills.source.bundled' : 'skills.source.github')}
            </Text>
          }
        />
        {skill.author ? (
          <Section.Item
            label={t('skills.detail.author')}
            trailing={<Text className="text-sm text-muted-foreground">{skill.author}</Text>}
          />
        ) : null}
        {skill.version ? (
          <Section.Item
            label={t('skills.detail.version')}
            trailing={<Text className="text-sm text-muted-foreground">{skill.version}</Text>}
          />
        ) : null}
        <Section.Item
          label={t('skills.detail.revision')}
          trailing={
            <Text className="text-sm text-muted-foreground">
              {skillContentHashHex(skill.contentHash).slice(0, 12)}
            </Text>
          }
        />
        <Section.Item
          label={t('skills.detail.files')}
          trailing={
            <Text className="text-sm text-muted-foreground">{String(skill.manifest.length)}</Text>
          }
        />
        <Section.Item
          label={t('skills.detail.verification')}
          trailing={
            <Text className="text-sm text-muted-foreground">
              {t(`skills.provenance.${skill.profile.provenance}`)}
            </Text>
          }
        />
      </Section>
      <BottomSheet
        onClose={() => setShowInstructions(false)}
        open={showInstructions}
        size="large"
        title={t('skills.detail.instructions')}
      >
        <ScrollView contentContainerClassName="gap-4 p-6">
          {instructions.isLoading ? (
            <ContentState.Loading title={t('skills.loading')} />
          ) : instructions.error || !instructions.data ? (
            <ContentState.Error
              primaryAction={{
                children: t('common.retry'),
                onPress: () => void instructions.refetch(),
              }}
              title={t('skills.detail.instructionsUnavailable')}
            />
          ) : (
            <>
              <Text className="text-sm text-muted-foreground" selectable>
                {instructions.data.name} ·{' '}
                {skillContentHashHex(instructions.data.contentHash).slice(0, 12)}
              </Text>
              <Text className="text-base text-foreground" selectable>
                {instructions.data.instructions}
              </Text>
            </>
          )}
        </ScrollView>
      </BottomSheet>
      <Text className="px-1 text-muted-foreground text-xs">{t('skills.detail.bindHint')}</Text>
      {isBusy ? (
        <Button disabled size="sm" variant="secondary">
          {t('skills.working')}
        </Button>
      ) : null}
    </SkillPage>
  );
}
