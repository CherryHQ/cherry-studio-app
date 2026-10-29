import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { RouteHeaderProps } from '@/frontend/appShell/header';
import { usePermittedItems, withResourcePolicy } from '@/frontend/components/Policy';
import { useBackendModule } from '@/frontend/data';
import { useSkillApiById, useSkillInstructionsApi } from '@/frontend/hooks/skill';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { isSkillsError } from '@/shared/contracts/skills';
import { managedResourcePolicy } from '@/shared/data/managedPolicy';
import type { SkillListItem } from '@/shared/data/types/skill';

import { SkillDocumentPage } from './SkillDocumentPage';
import { SkillLimitationList } from './SkillLimitationList';
import { SkillPage } from './SkillPage';

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

function SkillDetailView({ skill }: { skill: SkillListItem }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const skillsModule = useBackendModule('skills');
  const [isBusy, setIsBusy] = useState(false);
  const instructions = useSkillInstructionsApi(skill.id, true);

  async function update() {
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

  // The enterprise server owns a managed Skill's installation, so only its source stays reachable.
  const menuItems = usePermittedItems([
    ...(skill.sourceUrl
      ? [
          {
            id: 'skill-update',
            label: t('skills.detail.update'),
            onPress: () => void update(),
            requires: 'change' as const,
          },
        ]
      : []),
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
      requires: 'delete' as const,
    },
  ]);
  const headerProps: RouteHeaderProps = {
    rightActions:
      menuItems.length > 0
        ? [
            {
              accessibilityLabel: t('common.more'),
              disabled: isBusy,
              icon: EllipsisIcon,
              items: menuItems,
              key: 'skill-actions',
              type: 'menu',
            },
          ]
        : [],
    title: skill.name,
  };

  const feedback = (
    <>
      {skill.isPackageMissing ? (
        <Text className="text-sm text-warning">{t('skills.packageMissing')}</Text>
      ) : null}
      <SkillLimitationList limitations={skill.limitations} />
      {isBusy ? <ContentState.Loading layout="row" title={t('skills.working')} /> : null}
    </>
  );

  if (instructions.data && !instructions.error) {
    return (
      <SkillDocumentPage
        contentHash={instructions.data.contentHash}
        description={skill.description}
        headerProps={headerProps}
        instructions={instructions.data.instructions}
      >
        {feedback}
      </SkillDocumentPage>
    );
  }

  return (
    <SkillPage headerProps={headerProps}>
      {feedback}
      <Text className="text-base text-foreground">{skill.description}</Text>
      {instructions.isLoading ? (
        <ContentState.Loading title={t('skills.loading')} />
      ) : (
        <ContentState.Error
          primaryAction={{
            children: t('common.retry'),
            onPress: () => void instructions.refetch(),
          }}
          title={t('skills.detail.instructionsUnavailable')}
        />
      )}
    </SkillPage>
  );
}

/** The detail follows its Skill's policy. */
const SkillDetail = withResourcePolicy(SkillDetailView, ({ skill }) =>
  managedResourcePolicy(skill),
);
