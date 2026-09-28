import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Section, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data/BackendProvider';

const UNAVAILABLE_KEYS = {
  unsupported: 'settings.update.unsupported',
  unknownVersion: 'settings.update.unknownVersion',
  noRelease: 'settings.update.noRelease',
} as const;

/** Settings owns this subscription; checking never opens a dialog or blocks app usage. */
export function AppUpdateSection() {
  const appUpdate = useBackendModule('appUpdate');
  return appUpdate.isEnabled ? <GitcodeAppUpdateSection /> : null;
}

function GitcodeAppUpdateSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const appUpdate = useBackendModule('appUpdate');
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['appUpdate', 'gitcode'],
    queryFn: ({ signal }) => appUpdate.check(signal),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Never present a stale success as the outcome of a failed refresh.
  const result = isError ? undefined : data;
  const available = result?.status === 'available' ? result : undefined;
  let description = t('settings.update.description');
  if (isFetching) {
    description = t('settings.update.checking');
  } else if (isError) {
    description = t('settings.update.failed');
  } else if (result?.status === 'unavailable') {
    description = t(UNAVAILABLE_KEYS[result.reason]);
  } else if (result?.status === 'upToDate') {
    description = t('settings.update.upToDate', { version: result.currentVersion });
  } else if (available) {
    description = t('settings.update.availableVersion', {
      current: available.currentVersion,
      latest: available.latestVersion,
    });
  }

  const openDownload = async () => {
    if (!available) return;
    try {
      await appUpdate.openDownload(available.downloadUrl);
    } catch {
      toast.show({ label: t('settings.update.openFailed'), variant: 'danger' });
    }
  };

  return (
    <Section>
      <Section.Item
        accessibilityHint={description}
        accessibilityState={{ busy: isFetching }}
        description={description}
        disabled={isFetching}
        label={t('settings.update.check')}
        leading={<RefreshCwIcon className="size-4 text-foreground" />}
        onPress={() => {
          void refetch({ cancelRefetch: false });
        }}
        showChevron={false}
        testID="settings-check-update"
      />
      {available && !isFetching ? (
        <Section.Item
          accessibilityRole="link"
          description={t('settings.update.downloadDescription')}
          accessibilityHint={t('settings.update.downloadDescription')}
          label={t('settings.update.download')}
          leading={<DownloadIcon className="size-4 text-foreground" />}
          onPress={() => {
            void openDownload();
          }}
          testID="settings-open-update"
        />
      ) : null}
    </Section>
  );
}
