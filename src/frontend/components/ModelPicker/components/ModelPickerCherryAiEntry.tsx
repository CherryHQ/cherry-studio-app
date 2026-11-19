import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { CloudState } from '@/shared/contracts/cloud';

export function ModelPickerCherryAiEntry({
  state,
  restoring,
  onRetry,
}: {
  state: CloudState;
  restoring: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (state.guestCatalog === 'error' || state.phase === 'error') {
    return (
      <Section.Item
        inset="none"
        description={t(
          state.accountIssue === 'account_disabled'
            ? 'cloud.accountDisabled'
            : 'chat.errorPart.reason.providerUnavailable',
        )}
        label={t(
          state.accountIssue === 'reauth_required' ? 'account.login.reSignIn' : 'common.retry',
        )}
        onPress={onRetry}
      />
    );
  }
  const loading =
    restoring ||
    state.phase === 'loading' ||
    (state.phase === 'signed_out' && state.guestCatalog !== 'ready');
  return (
    <Section.Item
      inset="none"
      label={t(loading ? 'settings.provider.models.loading' : 'modelPicker.empty')}
    />
  );
}
