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
} from '@cherrystudio/app-icons';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ModelPickerTag } from '../utils/modelPickerData';
import { getModelPickerTagLabelKey } from '../utils/modelPickerData';

type ModelPickerTagHue = 'amber' | 'blue' | 'green' | 'red';

/**
 * `--tag-*` is the wash a badge sits on and `--tag-*-foreground` the mark drawn
 * on it; both flip with the theme, so one pair covers light and dark.
 */
const tagHueClassNames: Record<ModelPickerTagHue, { chip: string; icon: string }> = {
  amber: { chip: 'bg-tag-amber', icon: 'text-tag-amber-foreground' },
  blue: { chip: 'bg-tag-blue', icon: 'text-tag-blue-foreground' },
  green: { chip: 'bg-tag-green', icon: 'text-tag-green-foreground' },
  red: { chip: 'bg-tag-red', icon: 'text-tag-red-foreground' },
};

/**
 * Each tag used to carry a hardcoded hex (`#d946ef`, `#f18737`, …, the values
 * desktop uses) drawn on a 12.5%-alpha tint of itself. Those were fixed across
 * themes — one value had to work both on white and on the pure black dark
 * background — and against their own tint in light mode they measured 1.8–3.9:1,
 * seven of the nine below the 3:1 floor for meaningful graphics, worst the
 * `#FFA500` embedding badge at 1.81:1. The palette pairs land at 4.8–7.7:1.
 *
 * Hue is assigned by nearest match in OKLCh, since the palette ships four hues
 * against eight distinct tag colours. Seven tags land within 23° of their old
 * colour and read as the same badge. Two do not:
 * - `free` (#7cb305, 128°) is 19° from green but 52° from amber — it moves from
 *   olive to a plain green, which also puts it beside the two image tags.
 * - `audio` (#d946ef, 322°) is magenta, 61° from red and 64° from blue, so
 *   neither is a real match. Red keeps it visually distinct from the three blue
 *   tags; the red remove control on the same row is a bare glyph, not a pill,
 *   so the two do not read alike.
 */
const modelPickerTagMeta = {
  [MODEL_CAPABILITY.AUDIO_RECOGNITION]: { hue: 'red', Icon: AudioLinesIcon },
  [MODEL_CAPABILITY.CODE_EXECUTION]: { hue: 'amber', Icon: WrenchIcon },
  [MODEL_CAPABILITY.EMBEDDING]: { hue: 'amber', Icon: Code2Icon },
  [MODEL_CAPABILITY.FUNCTION_CALL]: { hue: 'amber', Icon: WrenchIcon },
  [MODEL_CAPABILITY.IMAGE_GENERATION]: { hue: 'green', Icon: SparklesIcon },
  [MODEL_CAPABILITY.IMAGE_RECOGNITION]: { hue: 'green', Icon: EyeIcon },
  [MODEL_CAPABILITY.REASONING]: { hue: 'blue', Icon: LightbulbIcon },
  [MODEL_CAPABILITY.RERANK]: { hue: 'blue', Icon: RotateCwIcon },
  [MODEL_CAPABILITY.WEB_SEARCH]: { hue: 'blue', Icon: GlobeIcon },
  free: { hue: 'green', Icon: GiftIcon },
} satisfies Record<ModelPickerTag, { hue: ModelPickerTagHue; Icon: typeof EyeIcon }>;

/**
 * One capability icon on a wash of its own hue, announced by its label.
 *
 * Icon-only and inert. It also took `isActive`/`showLabel`/`size`/`onPress`,
 * for the horizontal tag filter strip that sat above the model list until
 * `e1c036e6` removed it; nothing has passed any of them since. The `md` size,
 * the label and its fade transitions, the pressed state and the layout
 * animation all belonged to that strip, so they go with it. What is left needs
 * no `Pressable` and no `Animated`, which is worth something here: the list
 * recycles its rows and renders up to four of these in each one.
 */
export function ModelPickerTagChip({ tag }: { tag: ModelPickerTag }) {
  const { t } = useTranslation();
  const { hue, Icon } = modelPickerTagMeta[tag];
  const { chip, icon } = tagHueClassNames[hue];

  return (
    <View
      accessibilityLabel={t(getModelPickerTagLabelKey(tag))}
      accessible
      className={`h-5 flex-row items-center justify-center rounded-lg px-1.5 ${chip}`}
    >
      <Icon className={`size-3 ${icon}`} />
    </View>
  );
}
