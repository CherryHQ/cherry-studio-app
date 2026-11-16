import { ContentState } from '@cherrystudio/ui/components';
import { type LayoutChangeEvent, View } from 'react-native';

type RecoveryScreenProps = {
  description: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  onRetry: () => void;
  retryLabel: string;
  secondaryAction?: { label: string; onPress: () => void };
  title: string;
};

export function RecoveryScreen({
  description,
  onLayout,
  onRetry,
  retryLabel,
  secondaryAction,
  title,
}: RecoveryScreenProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center bg-background px-8"
      onLayout={onLayout}
    >
      <ContentState.Error
        description={description}
        primaryAction={{ children: retryLabel, onPress: onRetry }}
        secondaryAction={
          secondaryAction && { children: secondaryAction.label, onPress: secondaryAction.onPress }
        }
        prominence="prominent"
        title={title}
      />
    </View>
  );
}
