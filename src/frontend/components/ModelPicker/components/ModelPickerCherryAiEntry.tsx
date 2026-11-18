import { Section } from '@cherrystudio/ui/components';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { accountSignInHref, useAccount } from '@/frontend/appShell/account';
import { CloudAmdAction } from '@/frontend/appShell/cloud';
import {
  type ChatRouteParamsInput,
  chatReturnToHref,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { useCloud } from '@/frontend/hooks/useCloud';

export function ModelPickerCherryAiEntry({
  hasModels,
  onClose,
}: {
  hasModels: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const canLoadAmd =
    account.isSignedIn && state.phase === 'ready' && state.account?.account.status === 'active';

  useEffect(() => {
    if (canLoadAmd && !cloud.getState().amd) void cloud.refreshAmd();
  }, [canLoadAmd, cloud]);

  if (!account.isRestoringSession && !account.isSignedIn) {
    return (
      <Section.Item
        inset="none"
        label={t('account.login.signIn')}
        onPress={() => {
          const chat = parseChatRoute(params);
          const returnTo = chat.status === 'ready' ? chatReturnToHref(chat.target) : '/';
          onClose();
          router.push(accountSignInHref(returnTo, { cancelTo: returnTo }));
        }}
      />
    );
  }

  const { amd } = state;
  if (
    canLoadAmd &&
    amd?.phase === 'ready' &&
    (!amd.status.activated || amd.status.action !== 'none')
  )
    return <CloudAmdAction cloud={cloud} inset="none" status={amd.status} />;

  if (state.phase === 'error' || amd?.phase === 'error') {
    return (
      <Section.Item
        description={t('chat.errorPart.reason.providerUnavailable')}
        inset="none"
        label={t('common.retry')}
        onPress={() => void cloud.refreshProvider().catch(() => {})}
      />
    );
  }

  if (hasModels) return null;
  const isLoading =
    account.isRestoringSession || state.phase === 'loading' || amd?.phase === 'loading';
  return (
    <Section.Item
      inset="none"
      label={t(isLoading ? 'settings.provider.models.loading' : 'modelPicker.empty')}
    />
  );
}
