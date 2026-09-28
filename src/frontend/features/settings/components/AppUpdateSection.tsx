import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Chip, Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { AppUpdateResult } from '@/shared/contracts/appUpdate';

const UNAVAILABLE_KEYS = {
  unsupported: 'settings.update.unsupported',
  unknownVersion: 'settings.update.unknownVersion',
  noRelease: 'settings.update.noRelease',
} as const;

type AvailableAppUpdate = Extract<AppUpdateResult, { status: 'available' }>;

/** Settings reads the startup result and refetches on tap; download confirmation is owned here. */
export function AppUpdateSection() {
  const appUpdate = useBackendModule('appUpdate');
  return appUpdate.isEnabled ? <GitcodeAppUpdateSection /> : null;
}

function GitcodeAppUpdateSection() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const appUpdate = useBackendModule('appUpdate');
  const { data, isFetching, refetch } = useQuery({
    ...appUpdateQueryOptions(appUpdate),
    enabled: false,
  });
  // Preserve a known newer version if a later background refresh fails.
  const available = data?.status === 'available' ? data : undefined;

  const confirmDownload = (release: AvailableAppUpdate) => {
    alert.confirm({
      title: t('settings.update.confirmTitle'),
      description: t('settings.update.confirmDescription', {
        current: release.currentVersion,
        latest: release.latestVersion,
      }),
      confirmLabel: t('settings.update.download'),
      onConfirm: async () => {
        try {
          await appUpdate.openDownload(release.downloadUrl);
        } catch {
          toast.show({ label: t('settings.update.openFailed'), variant: 'danger' });
        }
      },
    });
  };

  const checkForUpdates = async () => {
    if (available) {
      confirmDownload(available);
      return;
    }
    if (isFetching) {
      toast.show({ label: t('settings.update.checking') });
      return;
    }
    toast.show({ label: t('settings.update.checking') });
    const result = await refetch();
    if (result.isError || !result.data) {
      toast.show({ label: t('settings.update.failed'), variant: 'danger' });
    } else if (result.data.status === 'available') {
      confirmDownload(result.data);
    } else if (result.data.status === 'upToDate') {
      toast.show({ label: t('settings.update.upToDate', { version: result.data.currentVersion }) });
    } else {
      toast.show({ label: t(UNAVAILABLE_KEYS[result.data.reason]) });
    }
  };

  return (
    <Section>
      <Section.Item
        accessibilityHint={available ? t('settings.update.confirmTitle') : undefined}
        accessibilityState={{ busy: isFetching }}
        label={t('settings.update.check')}
        leading={<RefreshCwIcon className="size-4 text-foreground" />}
        onPress={checkForUpdates}
        showChevron={false}
        testID="settings-check-update"
        trailing={
          available ? (
            <Chip.Tag className="px-2 py-0.5" testID="settings-update-new">
              <Chip.Label className="text-xs">{t('settings.update.newBadge')}</Chip.Label>
            </Chip.Tag>
          ) : undefined
        }
      />
    </Section>
  );
}
