import { Composer } from '@cherrystudio/ui/components';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type ContextUsageRingProps = {
  arcRatio?: number;
  severity?: 'primary' | 'warning' | 'error';
  label: string;
  onPress: () => void;
  testID: string;
};

export function ContextUsageRing({
  arcRatio,
  severity,
  label,
  onPress,
  testID,
}: ContextUsageRingProps) {
  const [track, primary, warning, error] = useThemeColor([
    'muted-foreground',
    'primary',
    'warning',
    'error',
  ]);
  const circumference = 2 * Math.PI * 8;
  const color = severity === 'warning' ? warning : severity === 'error' ? error : primary;
  return (
    <Composer.Action accessibilityLabel={label} onPress={onPress} testID={testID}>
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Circle cx={10} cy={10} r={8} stroke={track} strokeWidth={2} fill="none" opacity={0.3} />
        {arcRatio !== undefined ? (
          <Circle
            cx={10}
            cy={10}
            r={8}
            stroke={color}
            strokeWidth={2}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - arcRatio)}
            rotation={-90}
            origin="10, 10"
          />
        ) : null}
      </Svg>
    </Composer.Action>
  );
}
