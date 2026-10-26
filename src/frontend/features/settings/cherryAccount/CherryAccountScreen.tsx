import { Button, Section, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { CherryAccountStatus } from '@/shared/contracts/cherryAccount';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

export function CherryAccountScreen() {
  const account = useBackendModule('cherryAccount');
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [status, setStatus] = useState<CherryAccountStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    void account
      .getStatus()
      .then((value) => {
        if (mounted) setStatus(value);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
      attempt.current?.abort();
    };
  }, [account]);
  const signIn = async () => {
    setBusy(true);
    const controller = new AbortController();
    attempt.current = controller;
    try {
      await account.signIn(async (url, redirectUri) => {
        const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
        return result.type === 'success' ? result.url : null;
      }, controller.signal);
      if (!controller.signal.aborted) router.replace('/');
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof Error && error.message === 'cancelled'))
        toast.show({ label: t('settings.cherryAccount.failed'), variant: 'danger' });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <SettingsScrollPage
      headerProps={{ title: t('settings.cherryAccount.title') }}
      contentClassName="gap-6"
    >
      <View className="gap-2">
        <Text className="text-2xl font-semibold text-foreground">
          {status?.displayName || t('settings.cherryAccount.title')}
        </Text>
        <Text className="text-muted-foreground">{t('settings.cherryAccount.description')}</Text>
      </View>
      {failed ? (
        <View className="gap-3">
          <Text className="text-muted-foreground">{t('settings.cherryAccount.failed')}</Text>
          <Button
            onPress={() => {
              setFailed(false);
              void account
                .getStatus()
                .then(setStatus)
                .catch(() => setFailed(true));
            }}
          >
            {t('common.retry')}
          </Button>
        </View>
      ) : !status ? (
        <Text className="text-muted-foreground">{t('settings.cherryAccount.loading')}</Text>
      ) : !status.configured ? (
        <Text className="text-muted-foreground">{t('settings.cherryAccount.unavailable')}</Text>
      ) : status.signedIn ? (
        <>
          <Section>
            <Section.Item
              label={t(
                status.destination === 'enterprise'
                  ? 'settings.cherryAccount.enterprise'
                  : 'settings.cherryAccount.community',
              )}
            />
            {status.profileUrl && (
              <Section.Item
                label={t('settings.cherryAccount.profile')}
                onPress={() => void openExternalUrl(status.profileUrl!)}
              />
            )}
          </Section>
          <Button disabled={busy} loading={busy} onPress={() => void signIn()}>
            {t('settings.cherryAccount.switch')}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await account.signOut();
                setStatus(await account.getStatus());
              } catch {
                toast.show({ label: t('settings.cherryAccount.failed'), variant: 'danger' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('settings.cherryAccount.signOut')}
          </Button>
        </>
      ) : (
        <Button
          disabled={busy}
          loading={busy}
          onPress={() => void signIn()}
          testID="cherry-account-sign-in"
        >
          {t('settings.cherryAccount.signIn')}
        </Button>
      )}
    </SettingsScrollPage>
  );
}
