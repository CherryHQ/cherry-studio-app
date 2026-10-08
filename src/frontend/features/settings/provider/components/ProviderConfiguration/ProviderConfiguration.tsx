import { Spinner } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { keyboardBottomOffset } from '@/frontend/utils/constants';

import { ProviderAccountSection } from './components/ProviderAccountSection';
import { ProviderAddressSection } from './components/ProviderAddressSection';
import { ProviderApiKeysSection } from './components/ProviderApiKeysSection';
import { ProviderConnectionTestSection } from './components/ProviderConnectionTestSection';
import { ProviderIdentitySection } from './components/ProviderIdentitySection';
import type { ProviderConfigurationValue } from './types';

/**
 * The one provider configuration screen body, shared by provider details, setup from the
 * catalog, custom provider creation and onboarding. Sections always appear in the same
 * order and hide themselves when they do not apply; callers only add a header, a footer
 * inside the scroll view, or a fixed bottom action.
 *
 * The scroll view mounts before `value` lands, so the native header keeps its inset.
 */
export function ProviderConfiguration({
  bottomAction,
  footer,
  header,
  testID,
  value,
}: {
  bottomAction?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  testID?: string;
  value: ProviderConfigurationValue | undefined;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-1" testID={testID}>
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        mode="layout"
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        {header}
        {value ? (
          <View className="gap-6 px-4 pt-3 pb-8">
            <ProviderIdentitySection value={value} />
            {value.account ? (
              <ProviderAccountSection
                account={value.account}
                providerId={value.providerId}
                providerName={value.name}
              />
            ) : null}
            {value.apiKeys ? (
              <ProviderApiKeysSection apiKeys={value.apiKeys} value={value} />
            ) : null}
            {value.models && (value.apiKeys || value.account?.signedIn) ? (
              <ProviderConnectionTestSection
                apiKeys={value.account?.signedIn ? [] : (value.apiKeys ?? [])}
                signedIn={value.account?.signedIn}
                disabled={value.isBusy}
                models={value.models}
                providerId={value.providerId}
              />
            ) : null}
            <ProviderAddressSection value={value} />
            {footer}
          </View>
        ) : (
          <View className="items-center py-10">
            <Spinner accessibilityLabel={t('settings.provider.loading')} />
          </View>
        )}
      </KeyboardAwareScrollView>
      {bottomAction}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  screen: {
    flex: 1,
  },
});
