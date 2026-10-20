import { Button, Input, TextField } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import type { DesktopPairingQr } from '@/shared/data/api/schemas/desktopConnections';

import { parseDesktopPairingCode } from './parseDesktopPairingCode';

/** Keep invitation text local to this form, outside camera state and route parameters. */
export function DesktopPairingCodeForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (invitation: DesktopPairingQr) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit() {
    const invitation = parseDesktopPairingCode(value);
    if (!invitation) {
      setInvalid(true);
      return;
    }
    Keyboard.dismiss();
    setValue('');
    onSubmit(invitation);
  }

  return (
    <View className="gap-3">
      <TextField invalid={invalid}>
        <TextField.Label>{t('settings.deviceConnections.scan.codeLabel')}</TextField.Label>
        <Input
          accessibilityLabel={t('settings.deviceConnections.scan.codeLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          className="min-h-28"
          invalid={invalid}
          multiline
          onChangeText={(next) => {
            setValue(next);
            setInvalid(false);
          }}
          testID="desktop-pairing-code"
          textAlignVertical="top"
          value={value}
        />
        <TextField.Description>
          {t('settings.deviceConnections.scan.codeHint')}
        </TextField.Description>
        {invalid ? (
          <TextField.Error>{t('settings.deviceConnections.scan.invalidQr')}</TextField.Error>
        ) : null}
      </TextField>
      <Button
        disabled={disabled || !value.trim()}
        onPress={submit}
        testID="desktop-pairing-code-connect"
      >
        {t('settings.deviceConnections.scan.connect')}
      </Button>
    </View>
  );
}
