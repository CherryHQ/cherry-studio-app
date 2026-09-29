import { Button } from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The fixed action that finishes a provider or model task, with the reason it is unavailable
 * underneath. Provider setup and adding a model share it so both end the same way.
 */
export function ProviderBottomAction({
  disabled,
  hint,
  label,
  loading = false,
  onPress,
  testID,
}: {
  disabled: boolean;
  hint?: string;
  label: string;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View className="gap-2 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
      <Button disabled={disabled} loading={loading} onPress={onPress} size="lg" testID={testID}>
        {label}
      </Button>
      {disabled && hint && !loading ? (
        <Text className="text-center text-xs text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
