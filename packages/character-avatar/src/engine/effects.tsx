import { Circle, Group, Path, RoundedRect } from '@shopify/react-native-skia';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import { type MotionTimeline, ONE_SHOT_SECONDS } from './motion';

const BUBBLE = '#ffffff';
const ACCENT = '#ff5f5f';

/**
 * Cues outside the body, sized to stay readable down to a 24 pt avatar. Drawn around the frame
 * centre in pose reference units; the player scales them to the rig.
 */
export function StatusEffects({
  timeline,
  clock,
}: {
  timeline: SharedValue<MotionTimeline>;
  clock: SharedValue<number>;
}) {
  const elapsed = useDerivedValue(() => Math.max(0, clock.value - timeline.value.since));
  const appear = useDerivedValue(() => Math.min(1, elapsed.value / 0.22));
  const thinking = useDerivedValue(() => (timeline.value.status === 1 ? appear.value : 0));
  const waiting = useDerivedValue(() => (timeline.value.status === 2 ? appear.value : 0));
  const done = useDerivedValue((): number =>
    timeline.value.status === 3 && elapsed.value < ONE_SHOT_SECONDS.completed ? 1 : 0,
  );
  const failed = useDerivedValue((): number =>
    timeline.value.status === 4 && elapsed.value < ONE_SHOT_SECONDS.failed + 0.6 ? 1 : 0,
  );
  return (
    <Group>
      <ThinkingBubble opacity={thinking} clock={clock} />
      <WaitingBubble opacity={waiting} clock={clock} />
      <Sparkles opacity={done} elapsed={elapsed} />
      <SweatDrop opacity={failed} elapsed={elapsed} />
    </Group>
  );
}

// Positions are relative to the frame centre in pose reference units (a 700-wide frame).
const BUBBLE_AT = { x: 212, y: -204 };

function ThinkingBubble({
  opacity,
  clock,
}: {
  opacity: SharedValue<number>;
  clock: SharedValue<number>;
}) {
  return (
    <Group opacity={opacity}>
      <RoundedRect
        x={BUBBLE_AT.x - 92}
        y={BUBBLE_AT.y - 46}
        width={184}
        height={92}
        r={46}
        color={BUBBLE}
      />
      <Circle cx={BUBBLE_AT.x - 110} cy={BUBBLE_AT.y + 52} r={18} color={BUBBLE} />
      {[0, 1, 2].map((index) => (
        <ThinkingDot key={index} index={index} clock={clock} />
      ))}
    </Group>
  );
}

function ThinkingDot({ index, clock }: { index: number; clock: SharedValue<number> }) {
  const cy = useDerivedValue(() => {
    const phase = (((clock.value * 2.4 - index * 0.28) % 1) + 1) % 1;
    return BUBBLE_AT.y - 14 * Math.max(0, Math.sin(Math.PI * Math.min(1, phase * 2)));
  });
  return <Circle cx={BUBBLE_AT.x - 50 + index * 50} cy={cy} r={17} color={ACCENT} />;
}

function WaitingBubble({
  opacity,
  clock,
}: {
  opacity: SharedValue<number>;
  clock: SharedValue<number>;
}) {
  const transform = useDerivedValue(() => {
    const pulse = 1 + 0.08 * Math.sin(clock.value * Math.PI * 2 * 1.3);
    return [
      { translateX: BUBBLE_AT.x },
      { translateY: BUBBLE_AT.y },
      { scale: pulse * (0.6 + 0.4 * opacity.value) },
    ];
  });
  return (
    <Group opacity={opacity} transform={transform}>
      <Circle cx={0} cy={0} r={62} color={BUBBLE} />
      <RoundedRect x={-12} y={-40} width={24} height={50} r={12} color={ACCENT} />
      <Circle cx={0} cy={30} r={13} color={ACCENT} />
    </Group>
  );
}

const SPARKLE = 'M 0 -1 Q 0.12 -0.12 1 0 Q 0.12 0.12 0 1 Q -0.12 0.12 -1 0 Q -0.12 -0.12 0 -1 Z';
const SPARKLES = [
  { angle: -150, distance: 300, size: 46, color: '#ffc94d' },
  { angle: -105, distance: 330, size: 36, color: '#ffffff' },
  { angle: -40, distance: 310, size: 50, color: '#ffc94d' },
  { angle: 10, distance: 300, size: 34, color: '#ffffff' },
  { angle: 160, distance: 290, size: 38, color: '#ffffff' },
  { angle: -10, distance: 230, size: 26, color: ACCENT },
];

function Sparkles({
  opacity,
  elapsed,
}: {
  opacity: SharedValue<number>;
  elapsed: SharedValue<number>;
}) {
  return (
    <Group opacity={opacity}>
      {SPARKLES.map((sparkle, index) => (
        <Sparkle key={sparkle.angle} {...sparkle} delay={index * 0.06} elapsed={elapsed} />
      ))}
    </Group>
  );
}

function Sparkle({
  angle,
  distance,
  size,
  color,
  delay,
  elapsed,
}: (typeof SPARKLES)[number] & { delay: number; elapsed: SharedValue<number> }) {
  const transform = useDerivedValue(() => {
    const t = Math.max(0, Math.min(1, (elapsed.value - delay) / 1.0));
    const reach = 0.55 + 0.45 * (1 - (1 - t) ** 3);
    const r = (angle * Math.PI) / 180;
    const scale = size * Math.sin(Math.PI * t);
    return [
      { translateX: Math.cos(r) * distance * reach },
      { translateY: Math.sin(r) * distance * reach },
      { rotate: t * 1.4 },
      { scale: Math.max(0.001, scale) },
    ];
  });
  return <Path path={SPARKLE} color={color} transform={transform} />;
}

const DROP =
  'M 0 -1.4 C 0.5 -0.6 0.95 -0.1 0.95 0.35 C 0.95 0.95 0.5 1.3 0 1.3 C -0.5 1.3 -0.95 0.95 -0.95 0.35 C -0.95 -0.1 -0.5 -0.6 0 -1.4 Z';

function SweatDrop({
  opacity,
  elapsed,
}: {
  opacity: SharedValue<number>;
  elapsed: SharedValue<number>;
}) {
  const transform = useDerivedValue(() => {
    const t = Math.min(1, elapsed.value / (ONE_SHOT_SECONDS.failed + 0.6));
    return [{ translateX: 202 }, { translateY: -100 + 90 * t * t }, { scale: 30 }];
  });
  const fadeOut = useDerivedValue(() => {
    const t = elapsed.value / (ONE_SHOT_SECONDS.failed + 0.6);
    return opacity.value * Math.min(1, Math.max(0, (1 - t) * 3));
  });
  return (
    <Group opacity={fadeOut}>
      <Path path={DROP} color="#8fd0ff" transform={transform} />
    </Group>
  );
}
