import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

const ARROW_WIDTH = 96;
const ARROW_HEIGHT = 112;
// The arrow tip sits this far from the viewer's trailing edge, below the header's overflow action on
// both platforms. It is a pointer, not a hit target, so a near alignment is enough.
const ARROW_TIP_INSET = 40;
const ARROW_TIP_X = 72;

/**
 * Points from the page body up to the header's overflow menu, where system opening lives. The
 * caption carries the instruction for screen readers; the drawing is decorative.
 */
export function FileMenuGuide({ hint, title }: { hint: string; title: string }) {
  const stroke = useThemeColor('muted-foreground');

  return (
    <View className="flex-1">
      <View
        className="absolute top-1 items-end gap-1"
        style={{ right: ARROW_TIP_INSET - (ARROW_WIDTH - ARROW_TIP_X) }}
      >
        <Svg
          accessibilityElementsHidden
          height={ARROW_HEIGHT}
          importantForAccessibility="no-hide-descendants"
          viewBox={`0 0 ${ARROW_WIDTH} ${ARROW_HEIGHT}`}
          width={ARROW_WIDTH}
        >
          {/* Rises from the caption and turns straight up toward the overflow action. */}
          <Path
            d={`M 36 108 C 36 64, ${ARROW_TIP_X} 64, ${ARROW_TIP_X} 8`}
            fill="none"
            stroke={stroke}
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeWidth={2}
          />
          <Path
            d={`M ${ARROW_TIP_X - 9} 18 L ${ARROW_TIP_X} 6 L ${ARROW_TIP_X + 9} 18`}
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </Svg>
        <Text className="max-w-72 text-right text-sm text-muted-foreground">{hint}</Text>
      </View>
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-base font-medium text-foreground">{title}</Text>
      </View>
    </View>
  );
}
