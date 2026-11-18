import { Section } from '@cherrystudio/ui/components';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { accountSignInHref, useAccount } from '@/frontend/appShell/account';
import {
  type ChatRouteParamsInput,
  chatReturnToHref,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { useCloud } from '@/frontend/hooks/useCloud';

export function ModelPickerCherryAiEntry({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();

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

  if (state.phase === 'error') {
    return (
      <Section.Item
        description={t('chat.errorPart.reason.providerUnavailable')}
        inset="none"
        label={t('common.retry')}
        onPress={() => void cloud.refreshProvider().catch(() => {})}
      />
    );
  }

  const isLoading = account.isRestoringSession || state.phase === 'loading';
  return (
    <Section.Item
      inset="none"
      label={t(isLoading ? 'settings.provider.models.loading' : 'modelPicker.empty')}
    />
  );
}
