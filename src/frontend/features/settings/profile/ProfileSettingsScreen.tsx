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

/** The person's avatar, nickname and account: sign in, switch accounts or sign out. */
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
  // A cloud organization switches through the portal's choice; community and private accounts
  // pick a sign-in method first.
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
        {/* The identity provider may omit the account's name; an empty row says nothing. */}
        {state.isSignedIn && !state.isEnterprise && state.name ? (
          <Section.Item label={t('account.cloudAccount')} trailing={<Value>{state.name}</Value>} />
        ) : null}
        {organization ? (
          <Section.Item
            label={t(organization.kind === 'server' ? 'account.address' : 'account.organization')}
            trailing={<Value>{organization.label}</Value>}
          />
        ) : null}
        {state.isEnterprise && state.name ? (
          <Section.Item
            label={t(state.privateAddress ? 'account.username' : 'account.accountName')}
            trailing={<Value>{state.name}</Value>}
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
