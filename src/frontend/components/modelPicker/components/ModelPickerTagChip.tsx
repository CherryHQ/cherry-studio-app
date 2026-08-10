import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
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
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import type { ModelPickerTag } from '../utils/modelPickerData';
import { getModelPickerTagLabelKey } from '../utils/modelPickerData';

type ModelPickerTagHue = 'amber' | 'blue' | 'green' | 'red';

/**
 * `[tint, ink]` per hue. The palette is built for exactly this shape: the 100
 * step is the wash a badge sits on and the 900 step is the mark drawn on it, and
 * both flip with the theme, so one pair covers light and dark.
 *
 * Read through `useCSSVariable` rather than as `bg-*`/`text-*` classes because
 * palette steps are deliberately not Tailwind utilities — `check.ts` asserts
 * that every generated colour utility is a semantic contract name. Direct reads
 * are the sanctioned way in (the Storybook foundations pages do the same).
 */
const tagHueVariables: Record<ModelPickerTagHue, string[]> = {
  amber: ['--amber-100', '--amber-900'],
  blue: ['--blue-100', '--blue-900'],
  green: ['--green-100', '--green-900'],
  red: ['--red-100', '--red-900'],
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
  const [tint, ink] = useCSSVariable(tagHueVariables[hue]) as [string, string];

  return (
    <View
      accessibilityLabel={t(getModelPickerTagLabelKey(tag))}
      accessible
      className="h-5 flex-row items-center justify-center rounded-lg px-1.5"
      style={{ backgroundColor: tint }}
    >
      <Icon className="size-3" color={ink} />
    </View>
  );
}
