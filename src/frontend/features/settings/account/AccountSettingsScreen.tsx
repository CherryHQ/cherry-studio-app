import { Section, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ACCOUNT_ERROR_KEYS, useAccount } from '@/frontend/appShell/account';
import { AccountError } from '@/shared/contracts/account';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

/** Who is signed in, and the ways to switch accounts, return to local data or sign out. */
export default function AccountSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { account, state } = useAccount();
  const run = (action: () => Promise<void>) => {
    void action().catch((error: unknown) => {
      const code = error instanceof AccountError ? error.code : 'connection';
      toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
    });
  };
  const summary = state.isEnterprise
    ? t('account.enterprise', { name: state.name ?? '' })
    : state.isSignedIn
      ? t('account.community', { name: state.name ?? '' })
      : t('account.local');

  return (
    <SettingsScrollPage headerProps={{ title: t('account.title') }}>
      <Section footer={summary}>
        <Section.Item
          disabled={state.isBusy}
          label={state.isSignedIn ? t('account.switch') : t('account.login.signIn')}
          onPress={() => router.push('/login')}
        />
        {state.isEnterprise ? (
          <Section.Item
            disabled={state.isBusy}
            label={t('account.useLocal')}
            onPress={() => run(account.useLocal)}
          />
        ) : null}
        {state.isSignedIn ? (
          <Section.Item
            destructive
            disabled={state.isBusy}
            label={t('account.signOut')}
            onPress={() => run(account.signOut)}
          />
        ) : null}
      </Section>
    </SettingsScrollPage>
  );
}
