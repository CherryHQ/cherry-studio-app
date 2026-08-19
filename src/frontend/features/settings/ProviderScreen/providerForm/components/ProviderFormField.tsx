import { Label, TextField } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * A labelled row of the provider form. The accessory sits on the label line
 * rather than next to the input so a long endpoint URL keeps the full width.
 */
export function ProviderFormField({
  children,
  label,
  labelAccessory,
  required,
}: {
  children: ReactNode;
  label: string;
  labelAccessory?: ReactNode;
  required?: boolean;
}) {
  return (
    <TextField isRequired={required}>
      {labelAccessory ? (
        <View className="h-9 flex-row items-center gap-2">
          <Label className="min-w-0 flex-1">{label}</Label>
          {labelAccessory}
        </View>
      ) : (
        <Label>{label}</Label>
      )}
      {children}
    </TextField>
  );
}
