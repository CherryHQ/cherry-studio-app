import CloudIcon from '@cherrystudio/app-icons/icons/cloud';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/**
 * Neutral linear indicator showing an Agent or conversation runs on the Team cloud server.
 * Leave `accessible` false when an enclosing pressable already incorporates the label.
 */
export function CloudMark({
  accessible = false,
  className,
}: {
  accessible?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessible ? t('teamAgent.cloudExecution') : undefined}
      accessibilityRole={accessible ? 'image' : undefined}
      className="shrink-0 items-center justify-center"
      testID="cloud-execution-mark"
    >
      <CloudIcon
        accessible={false}
        className={
          className ? `size-4 text-muted-foreground ${className}` : 'size-4 text-muted-foreground'
        }
        strokeWidth={1.6}
      />
    </View>
  );
}
