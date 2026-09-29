import {
  BottomSheet,
  Button,
  Input,
  type InputKeyboardType,
  TextField,
} from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export type ProviderValueSheetAction = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
};

/**
 * One value edited on its own: a name, an address, a limit or a note. The owner keeps the text, so this
 * stays presentational and renders nothing that depends on app providers.
 */
export function ProviderValueSheet({
  autoCapitalize = 'none',
  children,
  description,
  error,
  keyboardType,
  label,
  multiline = false,
  onChangeText,
  onClose,
  onSubmit,
  open,
  placeholder,
  secondaryAction,
  submitDisabled = false,
  testID,
  title,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences';
  /** Extra content under the field, such as the request URL an address produces. */
  children?: ReactNode;
  description?: string;
  error?: string;
  keyboardType?: InputKeyboardType;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  placeholder?: string;
  secondaryAction?: ProviderValueSheetAction;
  submitDisabled?: boolean;
  testID?: string;
  title: string;
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      avoidKeyboard
      closeAction={{ accessibilityLabel: t('common.cancel') }}
      footer={
        <View className="gap-2">
          <Button disabled={submitDisabled} onPress={onSubmit} testID={`${testID}-submit`}>
            {t('common.save')}
          </Button>
          {secondaryAction ? (
            <Button
              disabled={secondaryAction.disabled}
              onPress={secondaryAction.onPress}
              variant="secondary"
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </View>
      }
      onClose={onClose}
      open={open}
      size="medium"
      testID={testID}
      title={title}
    >
      <View className="gap-3 px-4 pt-1">
        <TextField invalid={Boolean(error)}>
          <TextField.Label>{label}</TextField.Label>
          <Input
            accessibilityLabel={label}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCapitalize === 'sentences'}
            autoFocus
            keyboardType={keyboardType}
            multiline={multiline}
            onChangeText={onChangeText}
            onSubmitEditing={submitDisabled || multiline ? undefined : onSubmit}
            placeholder={placeholder}
            returnKeyType="done"
            testID={`${testID}-input`}
            value={value}
          />
          {description && !error ? (
            <TextField.Description>{description}</TextField.Description>
          ) : null}
          <TextField.Error>{error}</TextField.Error>
        </TextField>
        {children}
      </View>
    </BottomSheet>
  );
}
