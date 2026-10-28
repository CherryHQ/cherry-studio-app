import { Input, Section, TextField, useAlert, useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View, type TextInputInstance } from 'react-native';

import { ACCOUNT_ERROR_KEYS, organizationLabel, useAccount } from '@/frontend/appShell/account';
import { AvatarImagePicker, ProfileEditableAvatar } from '@/frontend/components/Avatar';
import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import { AccountError } from '@/shared/contracts/account';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const profileAvatarSize = 96;
const logger = loggerService.withContext('ProfileSettingsScreen');

function Value({ children }: { children: string }) {
  return (
    <Text className="text-right text-base text-muted-foreground" numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Local avatar/nickname and the current account, with distinct space and account switching. */
export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { alert } = useAlert();
  const inputRef = useRef<TextInputInstance>(null);
  const [userName, setUserName] = usePreference('app.user.name');
  const profile = useBackendModule('profile');
  const { account, state } = useAccount();
  const organization = organizationLabel(state);
  const [nameDraft, setNameDraft] = useState(userName);
  const persistSelectedAvatar = useCallback(
    (sourceUri: string) => profile.persistAvatar(sourceUri),
    [profile],
  );
  const reportAvatarSaveError = useCallback(
    (error: unknown) => {
      logger.error('Failed to save user avatar', error as Error);
      toast.show({ label: t('settings.profile.avatarSaveError'), variant: 'danger' });
    },
    [t, toast],
  );

  // The nickname saves as soon as editing ends, including when the page closes mid-edit.
  const saveName = () => {
    if (nameDraft === userName) return;
    void setUserName(nameDraft, { optimistic: true }).catch((error: unknown) => {
      logger.error('Failed to save user name', error as Error);
      toast.show({ label: t('settings.profile.userNameSaveError'), variant: 'danger' });
    });
  };
  const saveNameOnLeave = useEffectEvent(saveName);
  useEffect(() => () => saveNameOnLeave(), []);
  const blurInput = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const reportAccountError = (error: unknown) => {
    const code = error instanceof AccountError ? error.code : 'connection';
    toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
  };
  const openSignIn = () => router.push('/login');
  // Account switching asks for authentication; space switching reuses the browser sign-in.
  const switchAccount = () => {
    if (state.isEnterprise && !state.privateAddress)
      void account.signIn().catch(reportAccountError);
    else openSignIn();
  };
  /** Resolves whether the sign-out completed; a failure is reported here. */
  const signOut = () =>
    account.signOut().then(
      () => true,
      (error: unknown) => {
        reportAccountError(error);
        return false;
      },
    );
  const requestSignOut = () => {
    if (!state.isEnterprise) {
      // A community sign-out changes no visible content, so it needs no confirmation.
      void signOut().then((signedOut) => {
        if (signedOut) toast.show({ label: t('account.signedOutToast'), variant: 'success' });
      });
      return;
    }
    alert.confirm({
      confirmLabel: t('account.signOut'),
      description: t('account.signOutConfirm.description'),
      onConfirm: () => void signOut(),
      role: 'destructive',
      title:
        organization?.kind === 'organization'
          ? t('account.signOutConfirm.organizationTitle', { organization: organization.label })
          : t('account.signOutConfirm.title'),
    });
  };
  const isSignedIn = state.isSignedIn || state.isEnterprise;
  const accountLabel = state.name || state.maskedIdentifier || t('account.signedIn');
  const identifier = state.maskedIdentifier !== accountLabel ? state.maskedIdentifier : undefined;

  return (
    <SettingsScrollPage
      contentClassName="gap-8"
      headerProps={{ title: t('settings.profile.title') }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center">
        <AvatarImagePicker
          accessibilityLabel={t('settings.profile.changeAvatar')}
          onBeforeOpen={blurInput}
          onError={reportAvatarSaveError}
          onSelect={persistSelectedAvatar}
          size={profileAvatarSize}
        >
          <ProfileEditableAvatar
            accessibilityLabel={t('settings.profile.changeAvatar')}
            icon="camera"
            size={profileAvatarSize}
          />
        </AvatarImagePicker>
      </View>
      <TextField>
        <TextField.Label>{t('settings.profile.userName')}</TextField.Label>
        <Input
          accessibilityLabel={t('settings.profile.userName')}
          autoCorrect={false}
          onBlur={saveName}
          onChangeText={setNameDraft}
          onSubmitEditing={blurInput}
          ref={inputRef}
          returnKeyLabel="done"
          returnKeyType="done"
          value={nameDraft}
        />
      </TextField>
      <Section title={t('account.title')}>
        {!isSignedIn ? (
          <Section.Item
            description={t('account.signInDescription')}
            label={t('account.login.signIn')}
            onPress={openSignIn}
          />
        ) : null}
        {isSignedIn ? (
          <Section.Item
            label={t(organization?.kind === 'server' ? 'account.address' : 'account.space')}
            trailing={
              <Value>
                {organization?.label ??
                  t(state.isEnterprise ? 'account.enterprise' : 'account.community')}
              </Value>
            }
          />
        ) : null}
        {state.isSignedIn ? (
          <Section.Item
            description={identifier}
            label={t(state.privateAddress ? 'account.username' : 'account.cloudAccount')}
            trailing={<Value>{accountLabel}</Value>}
          />
        ) : null}
        {isSignedIn && state.isCloudSignInAvailable ? (
          <Section.Item
            disabled={state.isBusy}
            label={t('account.switchSpace')}
            onPress={() => void account.switchSpace().catch(reportAccountError)}
          />
        ) : null}
        {isSignedIn ? (
          <Section.Item
            disabled={state.isBusy}
            label={t('account.switch')}
            onPress={switchAccount}
          />
        ) : null}
      </Section>
      {isSignedIn ? (
        <Section>
          <Section.Item
            destructive
            disabled={state.isBusy}
            label={t('account.signOut')}
            onPress={requestSignOut}
            showChevron={false}
          />
        </Section>
      ) : null}
    </SettingsScrollPage>
  );
}
