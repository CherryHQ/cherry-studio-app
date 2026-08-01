import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { cn } from 'heroui-native/utils';
import {
  AudioLinesIcon,
  Code2Icon,
  EyeIcon,
  GiftIcon,
  GlobeIcon,
  LightbulbIcon,
  RotateCwIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-uniwind/png';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { ModelPickerTag } from '../utils/modelPickerData';
import { getModelPickerTagLabelKey } from '../utils/modelPickerData';

type ModelPickerTagChipProps = {
  isActive?: boolean;
  onPress?: () => void;
  showLabel?: boolean;
  size?: 'md' | 'sm';
  tag: ModelPickerTag;
};

type ModelPickerTagMeta = {
  color: string;
  renderIcon: (color: string, label: string, size: ModelPickerTagChipProps['size']) => ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const tagChipLayoutTransition = LinearTransition.duration(180);
const tagChipLabelEntering = FadeIn.duration(120);
const tagChipLabelExiting = FadeOut.duration(80);

export function ModelPickerTagChip({
  isActive = true,
  onPress,
  showLabel = false,
  size = 'sm',
  tag,
}: ModelPickerTagChipProps) {
  const { t } = useTranslation();
  const meta = modelPickerTagMeta[tag];
  const label = t(getModelPickerTagLabelKey(tag));
  const actualColor = isActive ? meta.color : '#aaaaaa';
  const isLabelVisible = showLabel && (!onPress || !isActive);

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: isActive } : undefined}
      accessible
      className={cn(
        'flex-row items-center justify-center rounded-lg',
        size === 'md' ? 'h-8 gap-1.5 px-3' : 'h-5 gap-1 px-1.5',
        onPress ? 'active:opacity-70' : null,
      )}
      disabled={!onPress}
      hitSlop={size === 'md' ? 6 : undefined}
      layout={tagChipLayoutTransition}
      onPress={onPress}
      style={{
        backgroundColor: withAlpha(actualColor, '20'),
      }}
    >
      {meta.renderIcon(actualColor, label, size)}
      {isLabelVisible ? (
        <Animated.Text
          className={cn('font-medium', size === 'md' ? 'text-sm' : 'text-xs')}
          entering={tagChipLabelEntering}
          exiting={tagChipLabelExiting}
          numberOfLines={1}
          style={{ color: actualColor }}
        >
          {label}
        </Animated.Text>
      ) : null}
    </AnimatedPressable>
  );
}

const modelPickerTagMeta = {
  [MODEL_CAPABILITY.AUDIO_RECOGNITION]: createIconTagMeta('#d946ef', AudioLinesIcon),
  [MODEL_CAPABILITY.CODE_EXECUTION]: createIconTagMeta('#f18737', WrenchIcon),
  [MODEL_CAPABILITY.EMBEDDING]: createIconTagMeta('#FFA500', Code2Icon),
  [MODEL_CAPABILITY.FUNCTION_CALL]: createIconTagMeta('#f18737', WrenchIcon),
  [MODEL_CAPABILITY.IMAGE_GENERATION]: createIconTagMeta('#00b96b', SparklesIcon),
  [MODEL_CAPABILITY.IMAGE_RECOGNITION]: createIconTagMeta('#00b96b', EyeIcon),
  [MODEL_CAPABILITY.REASONING]: createIconTagMeta('#6372bd', LightbulbIcon),
  [MODEL_CAPABILITY.RERANK]: createIconTagMeta('#6495ED', RotateCwIcon),
  [MODEL_CAPABILITY.WEB_SEARCH]: createIconTagMeta('#1677ff', GlobeIcon),
  free: createIconTagMeta('#7cb305', GiftIcon),
} satisfies Record<ModelPickerTag, ModelPickerTagMeta>;

function createIconTagMeta(color: string, Icon: typeof EyeIcon): ModelPickerTagMeta {
  return {
    color,
    renderIcon: (iconColor, _label, size) => (
      <Icon
        color={iconColor}
        height={size === 'md' ? 16 : 12}
        strokeWidth={2}
        width={size === 'md' ? 16 : 12}
      />
    ),
  };
}

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}
