import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Chip, Section } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { appUpdateQueryOptions, useAppUpdateDownload } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';

import { useAppUpdateActions } from './AppUpdateProvider';

/** Every entry point can use the same update state, independent of its surrounding page. */
export function AppUpdateSection() {
  const appUpdate = useBackendModule('appUpdate');
  const { data, isFetching } = useQuery({ ...appUpdateQueryOptions(appUpdate), enabled: false });
  const transfer = useAppUpdateDownload(appUpdate);
  const actions = useAppUpdateActions();
  const { t } = useTranslation();
  if (!appUpdate.isEnabled) return null;

  const downloading = transfer.status === 'downloading' || transfer.status === 'verifying';
  const label =
    transfer.status === 'ready'
      ? t('appUpdate.install')
      : transfer.status === 'failed'
        ? t('appUpdate.retryDownload')
        : transfer.status === 'verifying'
          ? t('appUpdate.verifying')
          : transfer.status === 'downloading'
            ? transfer.totalBytes === null
              ? t('appUpdate.downloading')
              : t('appUpdate.downloadProgress', {
                  percent: Math.min(
                    100,
                    Math.floor((100 * transfer.receivedBytes) / transfer.totalBytes),
                  ),
                })
            : t('appUpdate.check');

  return (
    <Section>
      <Section.Item
        accessibilityState={{ busy: isFetching || downloading }}
        disabled={downloading}
        label={label}
        leading={<RefreshCwIcon className="size-4 text-foreground" />}
        onPress={() => {
          void actions.check();
        }}
        showChevron={false}
        testID="settings-check-update"
        trailing={
          data?.status === 'available' && transfer.status === 'idle' ? (
            <Chip.Tag className="px-2 py-0.5" testID="settings-update-new">
              <Chip.Label className="text-xs">{t('appUpdate.newBadge')}</Chip.Label>
            </Chip.Tag>
          ) : undefined
        }
      />
      {downloading ? (
        <Section.Item
          label={t('appUpdate.cancelDownload')}
          onPress={() => {
            void actions.cancelDownload();
          }}
          showChevron={false}
        />
      ) : null}
    </Section>
  );
}
