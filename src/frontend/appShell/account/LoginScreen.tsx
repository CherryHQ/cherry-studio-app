import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Image } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppLogo } from '@/frontend/appShell/branding';
import { isAcross, useFoldRegion, useWindowClass } from '@/frontend/appShell/layout';

import { AccountSignInFields } from './AccountSignInFields';
import { organizationLabel } from './organizationLabel';
import { useAccount } from './useAccount';
import { useAccountSignInForm } from './useAccountSignInForm';

/**
 * `sign-in` and `switch` open from settings and close back to it;
 * `expired` replaces an organization whose session was refused and offers sign-out instead.
 */
export type LoginPurpose = 'sign-in' | 'switch' | 'expired';

type LoginScreenProps = {
  purpose: LoginPurpose;
  returnTo: string;
  /** Closes from settings or signs out when expired. */
  onLeave: () => void;
  /** Called when sign-in keeps the app in place; another organization reloads it instead. */
  onSignedIn?: () => void;
};

/** Cloud sign-in opens Accounts Portal; private deployments use their own password endpoint. */
export function LoginScreen({ onLeave, onSignedIn, purpose, returnTo }: LoginScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const windowClass = useWindowClass();
  const fold = useFoldRegion();
  const isFoldSplit = Boolean(fold && !isAcross(fold));
  const isWide = windowClass === 'wide';
  const { state } = useAccount();
  const isExpired = purpose === 'expired';
  // An expired private session signs in again to the same server and, when known, the same user.
  const lockedAddress = isExpired ? state.privateAddress : undefined;
  const lockedUsername = lockedAddress ? state.privateUsername : undefined;
  const form = useAccountSignInForm({ expired: isExpired, returnTo });
  const { isPrivate, canSignIn } = form;
  const organization = organizationLabel(state);
  const signIn = () => {
    void form.signIn().then((signedIn) => {
      if (signedIn) onSignedIn?.();
    });
  };

  const title = isExpired
    ? t('account.login.expiredTitle')
    : isPrivate
      ? t('account.login.private')
      : purpose === 'switch'
        ? t('account.switch')
        : t('account.login.title');
  const description = isExpired
    ? lockedUsername
      ? t('account.login.expiredPrivateDescription')
      : organization?.kind === 'organization'
        ? t('account.login.expiredOrganizationDescription', { organization: organization.label })
        : t('account.login.expiredDescription')
    : isPrivate
      ? t('account.login.privateDescription')
      : purpose === 'switch'
        ? t('account.login.switchDescription')
        : t('account.login.description');

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {purpose === 'sign-in' || purpose === 'switch' ? (
        <View className="flex-row px-4 py-2">
          <Button
            accessibilityLabel={t('common.close')}
            disabled={state.isBusy}
            icon={<XIcon />}
            onPress={onLeave}
            shape="pill"
            variant="tonal"
          />
        </View>
      ) : null}
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerClassName={
          isFoldSplit
            ? 'flex-grow flex-row items-center justify-center gap-8 px-8 pb-4'
            : 'flex-grow justify-between gap-8 pb-4'
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          className={
            isFoldSplit
              ? 'flex-1 items-center justify-center gap-5 px-8 py-12'
              : 'mx-auto w-full max-w-[460px] flex-grow items-center justify-center gap-5 px-8 py-12'
          }
        >
          <Image
            accessibilityIgnoresInvertColors
            className="size-20 rounded-2xl"
            source={getAppLogo()}
          />
          <View className="items-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-center font-semibold text-3xl text-foreground"
            >
              {title}
            </Text>
            <Text className="text-center text-base text-muted-foreground">{description}</Text>
          </View>
        </View>
        <View
          className={
            isFoldSplit
              ? 'mx-auto w-full max-w-[460px] flex-1 justify-center gap-4 px-6'
              : isWide
                ? 'mx-auto w-full max-w-[460px] gap-4 px-6'
                : 'gap-4 px-6'
          }
        >
          {isPrivate ? <AccountSignInFields form={form} onSubmit={signIn} /> : null}
          <View className="gap-2">
            <Button disabled={!canSignIn} loading={state.isBusy} onPress={signIn} size="lg">
              {t(isExpired ? 'account.login.reSignIn' : 'account.login.signIn')}
            </Button>
            {!isExpired ? (
              <Button disabled={state.isBusy} onPress={form.switchMethod} variant="ghost">
                {t(isPrivate ? 'account.login.cloud' : 'account.login.private')}
              </Button>
            ) : null}
            {isExpired ? (
              <Button disabled={state.isBusy} onPress={onLeave} variant="ghost">
                {t('account.signOut')}
              </Button>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
