import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Chip, Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';

const UNAVAILABLE_KEYS = {
  unsupported: 'settings.update.unsupported',
  unknownVersion: 'settings.update.unknownVersion',
  noRelease: 'settings.update.noRelease',
} as const;

/** Settings reads the startup result; only download confirmation is owned by this row. */
export function AppUpdateSection() {
  const appUpdate = useBackendModule('appUpdate');
  return appUpdate.isEnabled ? <GitcodeAppUpdateSection /> : null;
}

function GitcodeAppUpdateSection() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const appUpdate = useBackendModule('appUpdate');
  const { data, isFetching, isError } = useQuery({
    ...appUpdateQueryOptions(appUpdate),
    enabled: false,
  });
  // Preserve a known newer version if a later background refresh fails.
  const available = data?.status === 'available' ? data : undefined;

  const showUpdate = () => {
    if (available) {
      alert.confirm({
        title: t('settings.update.confirmTitle'),
        description: t('settings.update.confirmDescription', {
          current: available.currentVersion,
          latest: available.latestVersion,
        }),
        confirmLabel: t('settings.update.download'),
        onConfirm: async () => {
          try {
            await appUpdate.openDownload(available.downloadUrl);
          } catch {
            toast.show({ label: t('settings.update.openFailed'), variant: 'danger' });
          }
        },
      });
      return;
    }
    if (isFetching) {
      toast.show({ label: t('settings.update.checking') });
    } else if (isError) {
      toast.show({ label: t('settings.update.failed'), variant: 'danger' });
    } else if (data?.status === 'upToDate') {
      toast.show({ label: t('settings.update.upToDate', { version: data.currentVersion }) });
    } else if (data?.status === 'unavailable') {
      toast.show({ label: t(UNAVAILABLE_KEYS[data.reason]) });
    } else {
      toast.show({ label: t('settings.update.checking') });
    }
  };

  return (
    <Section>
      <Section.Item
        accessibilityHint={available ? t('settings.update.confirmTitle') : undefined}
        accessibilityState={{ busy: isFetching }}
        label={t('settings.update.check')}
        leading={<RefreshCwIcon className="size-4 text-foreground" />}
        onPress={showUpdate}
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
