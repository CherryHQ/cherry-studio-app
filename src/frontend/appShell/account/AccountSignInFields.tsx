import { Input, TextField } from '@cherrystudio/ui/components';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInputInstance } from 'react-native';

import type { useAccountSignInForm } from './useAccountSignInForm';

export function AccountSignInFields({
  form,
  onSubmit,
}: {
  form: ReturnType<typeof useAccountSignInForm>;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const usernameInput = useRef<TextInputInstance>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  return (
    <View className="gap-4">
      <TextField disabled={form.isBusy || form.isAddressLocked}>
        <TextField.Label>{t('account.address')}</TextField.Label>
        <Input
          accessibilityLabel={t('account.address')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={form.setAddress}
          value={form.address}
          onSubmitEditing={() => usernameInput.current?.focus()}
          returnKeyType="next"
          submitBehavior="submit"
        />
      </TextField>
      <TextField disabled={form.isBusy || form.isUsernameLocked}>
        <TextField.Label>{t('account.username')}</TextField.Label>
        <Input
          accessibilityLabel={t('account.username')}
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect={false}
          onChangeText={form.setUsername}
          value={form.username}
          ref={usernameInput}
          onSubmitEditing={() => passwordInput.current?.focus()}
          returnKeyType="next"
          submitBehavior="submit"
        />
      </TextField>
      <TextField disabled={form.isBusy}>
        <TextField.Label>{t('account.password')}</TextField.Label>
        <Input
          accessibilityLabel={t('account.password')}
          autoComplete="current-password"
          onChangeText={form.setPassword}
          value={form.password}
          ref={passwordInput}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          type="password"
          textContentType="password"
          visibilityAccessibilityLabels={{
            hide: t('account.hidePassword'),
            show: t('account.showPassword'),
          }}
        />
      </TextField>
    </View>
  );
}
