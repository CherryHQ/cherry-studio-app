import Building2Icon from '@cherrystudio/app-icons/icons/building-2';
import ServerIcon from '@cherrystudio/app-icons/icons/server';
import { Button, Image, Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, TextInput, View, type TextInputInstance } from 'react-native';

import { ACCOUNT_ERROR_KEYS, organizationLabel, useAccount } from '@/frontend/appShell/account';
import { AvatarImagePicker, ProfileEditableAvatar } from '@/frontend/components/Avatar';
import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import { useCloud } from '@/frontend/hooks/useCloud';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { AccountError } from '@/shared/contracts/account';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const APP_LOGO = require('@/assets/cherry-studio-logo.png');
const profileAvatarSize = 96;
const logger = loggerService.withContext('ProfileSettingsScreen');

/** The account kind: the Cherry Studio logo, an organization or a private server. */
function AccountTile({ kind }: { kind: 'cherry' | 'organization' | 'server' }) {
  const Icon = kind === 'organization' ? Building2Icon : kind === 'server' ? ServerIcon : null;
  return (
    <View className="size-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary">
      {Icon ? (
        <Icon className="size-5 text-foreground" />
      ) : (
        <Image accessibilityIgnoresInvertColors className="size-10" source={APP_LOGO} />
      )}
    </View>
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
  const mutedForegroundColor = useThemeColor('muted-foreground');
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
    logger.error('Account action failed', error as Error, { operation: 'account.action' });
    const code = error instanceof AccountError ? error.code : 'failed';
    toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
  };
  const openSignIn = () => router.push('/login');
  const isSignedIn = state.isSignedIn || state.isEnterprise;
  // A cloud account switches organization through the portal, reusing its browser sign-in.
  const canSwitchOrganization = isSignedIn && !state.privateAddress;
  const switchOrganization = () => void account.switchSpace().catch(reportAccountError);
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
  const accountName = state.name || state.maskedIdentifier;
  // One card for every account: what is signed in, and the way to sign in or switch.
  const card = !isSignedIn
    ? {
        kind: 'cherry' as const,
        title: t('account.notSignedIn'),
        detail: t('account.signInDescription'),
      }
    : state.isEnterprise
      ? {
          kind: organization?.kind ?? ('organization' as const),
          title: organization?.label ?? t('account.organization'),
          detail: [
            accountName,
            t(state.privateAddress ? 'account.kind.private' : 'account.kind.organization'),
          ]
            .filter(Boolean)
            .join(' · '),
        }
      : { kind: 'cherry' as const, title: t('account.cloudAccount'), detail: accountName };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.profile.title') }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-3">
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
        <TextInput
          accessibilityLabel={t('settings.profile.userName')}
          autoCorrect={false}
          className="min-w-40 max-w-full border-b border-border-strong px-2 pb-1.5 text-center font-semibold text-xl text-foreground"
          cursorColor={mutedForegroundColor}
          onBlur={saveName}
          onChangeText={setNameDraft}
          onSubmitEditing={blurInput}
          placeholder={t('settings.profile.namePlaceholder')}
          placeholderTextColor={mutedForegroundColor}
          ref={inputRef}
          returnKeyLabel="done"
          returnKeyType="done"
          selectionColor={mutedForegroundColor}
          value={nameDraft}
        />
      </View>
      <Section title={t('account.title')}>
        <Section.Item
          description={card.detail || undefined}
          label={card.title}
          leading={<AccountTile kind={card.kind} />}
          trailing={
            <Button
              disabled={state.isBusy}
              onPress={canSwitchOrganization ? switchOrganization : openSignIn}
              size="sm"
              variant={isSignedIn ? 'tonal' : 'default'}
            >
              {t(
                canSwitchOrganization
                  ? 'account.switchOrganization'
                  : isSignedIn
                    ? 'account.switch'
                    : 'account.login.signIn',
              )}
            </Button>
          }
        />
      </Section>
      {isSignedIn && !state.isEnterprise ? <SubscriptionEntry /> : null}
      {isSignedIn ? (
        <Section
          // Only an organization's data leaves with its sign-out; a community account keeps it.
          footer={state.isEnterprise ? t('account.signOutConfirm.description') : undefined}
        >
          {canSwitchOrganization ? (
            <Section.Item
              disabled={state.isBusy}
              label={t('account.switch')}
              onPress={openSignIn}
            />
          ) : null}
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

function SubscriptionEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state } = useCloud();
  const plans = state.plans?.entitlements
    .filter((entry) => entry.state === 'active')
    .map((entry) => entry.plan.display_name);
  return (
    <Section>
      <Section.Item
        label={t('cloud.title')}
        description={
          state.phase === 'error'
            ? t('cloud.unavailable')
            : state.phase === 'loading'
              ? t('cloud.loading')
              : plans?.join(', ') || t('cloud.noPlans')
        }
        onPress={() => router.push('/settings/profile/subscription')}
      />
    </Section>
  );
}
