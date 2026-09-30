import { Button, Input } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ProviderSignInPrompt } from '@/shared/contracts/providerAccounts';

/** The field draft stays in this leaf and is discarded when its login step ends. */
export function ProviderSignInPromptRow({
  prompt,
  onAnswer,
}: {
  prompt: ProviderSignInPrompt;
  onAnswer(value: string): void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const enterprise = prompt.type === 'enterprise-domain';
  return (
    <View className="gap-3 p-4">
      <Text className="text-base text-foreground">
        {t(
          enterprise
            ? 'settings.provider.account.enterpriseDomain'
            : 'settings.provider.account.authorizationCode',
        )}
      </Text>
      <Input
        accessibilityLabel={t(
          enterprise
            ? 'settings.provider.account.enterpriseDomain'
            : 'settings.provider.account.authorizationCode',
        )}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setValue}
        placeholder={t(
          enterprise
            ? 'settings.provider.account.enterpriseDomainHint'
            : 'settings.provider.account.authorizationCodeHint',
        )}
        value={value}
      />
      <Button disabled={!enterprise && !value.trim()} onPress={() => onAnswer(value.trim())}>
        <Button.Label>{t('common.ok')}</Button.Label>
      </Button>
    </View>
  );
}
