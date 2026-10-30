import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { UuRemoteError, type UuRemoteFailure } from '@/shared/contracts/uuRemote';

const FAILURE_KEYS: Record<UuRemoteFailure, string> = {
  'not-installed': 'uuRemote.install.description',
  'pip-unsupported': 'uuRemote.error.pipUnsupported',
  'device-offline': 'uuRemote.error.offline',
  'binding-invalid': 'uuRemote.error.bindingInvalid',
  'no-device': 'uuRemote.error.noDevice',
  busy: 'uuRemote.error.busy',
  'not-allowed': 'uuRemote.error.notAllowed',
  network: 'uuRemote.error.network',
  timeout: 'uuRemote.error.timeout',
  login: 'uuRemote.error.login',
  failed: 'uuRemote.error.failed',
};

export function useUuRemoteFeedback() {
  const { alert } = useAlert();
  const { toast } = useToast();
  const { t } = useTranslation();

  return (error: unknown) => {
    const reason = error instanceof UuRemoteError ? error.reason : 'failed';
    if (reason === 'not-installed') {
      alert.confirm({
        title: t('uuRemote.install.title'),
        description: t('uuRemote.install.description'),
        confirmLabel: t('uuRemote.install.action'),
        onConfirm: () =>
          openExternalUrl(
            Platform.OS === 'ios'
              ? 'https://apps.apple.com/app/id1642306791'
              : 'https://uuyc.163.com/',
          ),
      });
    } else {
      toast.show({ label: t(FAILURE_KEYS[reason]), variant: 'danger' });
    }
  };
}
