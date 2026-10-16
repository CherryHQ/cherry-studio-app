import {
  Canvas,
  Group,
  Image,
  ImageShader,
  type SkImage,
  Vertices,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type SharedValue,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CHARACTER_SAMPLING, CharacterFrame, CharacterStill } from './CharacterStill';
import { StatusEffects } from './effects';
import { createCharacterMesh, deformMesh, deformPoint } from './mesh';
import {
  characterPose,
  type CharacterPose,
  isBlinking,
  MOTION_STATUSES,
  type MotionTimeline,
  POSE_REFERENCE_SIDE,
} from './motion';
import type { CharacterExpression, CharacterRig, CharacterSprite, CharacterStatus } from './types';
import { type SpriteImages, useSpriteImages } from './useSpriteImages';

const EXPRESSION_BY_STATUS: Record<CharacterStatus, CharacterExpression> = {
  idle: 'idle',
  running: 'thinking',
  waiting: 'waiting',
  completed: 'done',
  failed: 'error',
};
/** How long the face keeps reporting a finished run before relaxing. */
const TERMINAL_FACE_MS = 2600;
const TRAIL_SECONDS = 0.09;
const BLINKING_FACES = new Set<CharacterExpression>(['idle', 'thinking', 'waiting']);

type CharacterPlayerProps = {
  sprite: CharacterSprite;
  background: string;
  size: number;
  status?: CharacterStatus;
  /** False renders still art, as does the system reduced-motion setting. */
  animate?: boolean;
};

/** Self-contained Skia canvas for one character; renders nothing until its layers decode. */
export function CharacterPlayer({
  sprite,
  background,
  size,
  status = 'idle',
  animate = true,
}: CharacterPlayerProps) {
  const images = useSpriteImages(sprite.layers);
  const reducedMotion = useReducedMotion();
  const face = useStatusFace(status);
  return (
    <Canvas style={{ width: size, height: size }}>
      {!images ? null : animate && !reducedMotion ? (
        <MovingCharacter
          rig={sprite.rig}
          images={images}
          background={background}
          size={size}
          status={status}
          face={face}
        />
      ) : (
        <CharacterStill
          rig={sprite.rig}
          images={images}
          background={background}
          size={size}
          expression={face.current}
        />
      )}
    </Canvas>
  );
}

/**
 * The face follows the status. A run that had already finished before this avatar appeared is
 * shown at rest; only a completion or failure observed live gets its one-shot reaction.
 */
function useStatusFace(status: CharacterStatus) {
  const settled = (value: CharacterStatus) =>
    value === 'completed' || value === 'failed' ? 'idle' : EXPRESSION_BY_STATUS[value];
  const [face, setFace] = useState(() => ({ current: settled(status), previous: settled(status) }));
  const seen = useRef(status);
  useEffect(() => {
    if (seen.current === status) return;
    seen.current = status;
    const next = EXPRESSION_BY_STATUS[status];
    setFace((old) => ({ current: next, previous: old.current }));
    if (status !== 'completed' && status !== 'failed') return;
    const timer = setTimeout(
      () => setFace((old) => ({ current: 'idle', previous: old.current })),
      TERMINAL_FACE_MS,
    );
    return () => clearTimeout(timer);
  }, [status]);
  return face;
}

function useStatusTimeline(status: CharacterStatus) {
  // A run that had already finished before this avatar appeared starts at rest.
  const initial =
    status === 'completed' || status === 'failed' ? 0 : MOTION_STATUSES.indexOf(status);
  const timeline = useSharedValue<MotionTimeline>({
    status: initial,
    since: 0,
    previous: initial,
    previousSince: 0,
  });
  const requested = useSharedValue(initial);
  const seen = useRef(status);
  useEffect(() => {
    if (seen.current === status) return;
    seen.current = status;
    requested.value = MOTION_STATUSES.indexOf(status);
  }, [requested, status]);
  return { timeline, requested };
}

/** Pose translations come in reference units; rigs of any canvas size get them in pixels. */
function scalePose(pose: CharacterPose, k: number): CharacterPose {
  'worklet';
  return { ...pose, x: pose.x * k, y: pose.y * k };
}

function MovingCharacter({
  rig,
  images,
  background,
  size,
  status,
  face,
}: {
  rig: CharacterRig;
  images: SpriteImages;
  background: string;
  size: number;
  status: CharacterStatus;
  face: { current: CharacterExpression; previous: CharacterExpression };
}) {
  const mesh = useMemo(() => createCharacterMesh(rig), [rig]);
  const k = rig.frame.side / POSE_REFERENCE_SIDE;
  const clock = useSharedValue(0);
  const { timeline, requested } = useStatusTimeline(status);
  // Status start times are stamped here, on the UI thread: the JS thread only ever sees a stale
  // copy of `clock`. The frame timestamp is monotonic across callback re-registration.
  useFrameCallback((frame) => {
    const now = frame.timestamp / 1000;
    clock.value = now;
    const target = requested.value;
    const current = timeline.value;
    if (target === current.status) return;
    timeline.value = {
      status: target,
      since: now,
      previous: current.status,
      previousSince: current.since,
    };
  });
  const fade = useSharedValue(1);
  const blinkable = useSharedValue(BLINKING_FACES.has(face.current));
  useEffect(() => {
    blinkable.value = BLINKING_FACES.has(face.current);
    if (face.current === face.previous) return;
    fade.value = 0;
    fade.value = withTiming(1, { duration: 160 });
  }, [blinkable, face, fade]);

  const pose = useDerivedValue(() => scalePose(characterPose(timeline.value, clock.value), k));
  const lag = useDerivedValue(() => {
    const before = scalePose(
      characterPose(timeline.value, Math.max(0, clock.value - TRAIL_SECONDS)),
      k,
    );
    const now = pose.value;
    return { ...now, x: before.x - now.x, y: before.y - now.y, rotate: before.rotate - now.rotate };
  });
  const vertices = useDerivedValue(() => deformMesh(mesh, lag.value, pose.value, rig));
  const bodyTransform = useDerivedValue(() => {
    const p = pose.value;
    return [
      { translateX: rig.neck.x + p.x },
      { translateY: rig.neck.y + p.y },
      { rotate: (p.rotate * Math.PI) / 180 },
      { scaleX: p.scaleX },
      { scaleY: p.scaleY },
      { translateX: -rig.neck.x },
      { translateY: -rig.neck.y },
    ];
  });
  const tuftTransform = useDerivedValue(() => {
    const pivot = rig.tuft?.pivot ?? rig.neck;
    const top = rig.frame.center.y - rig.frame.side / 2;
    const height = Math.max(0, Math.min(1, (rig.neck.y - pivot.y) / (rig.neck.y - top))) ** 1.4;
    const at = deformPoint(pivot, height, [], lag.value, pose.value, rig);
    const swing = pose.value.tuft + lag.value.rotate * 2.2 + (lag.value.x / k) * 0.25;
    return [
      { translateX: at.x },
      { translateY: at.y },
      { rotate: (swing * Math.PI) / 180 },
      { translateX: -pivot.x },
      { translateY: -pivot.y },
    ];
  });
  const blink = useDerivedValue((): number => (blinkable.value && isBlinking(clock.value) ? 1 : 0));
  const effectsTransform = [
    { translateX: rig.frame.center.x },
    { translateY: rig.frame.center.y },
    { scale: k },
  ];

  const layer = (image: SkImage, opacity?: SharedValue<number>) => (
    <Vertices
      vertices={vertices}
      textures={mesh.rest}
      indices={mesh.indices}
      mode="triangles"
      opacity={opacity}
    >
      <ImageShader
        image={image}
        fit="fill"
        rect={{ x: 0, y: 0, width: rig.size, height: rig.size }}
        sampling={CHARACTER_SAMPLING}
      />
    </Vertices>
  );
  return (
    <CharacterFrame rig={rig} background={background} size={size}>
      <Group transform={bodyTransform}>
        {layer(images.expressions[face.previous])}
        {layer(images.expressions[face.current], fade)}
        {layer(images.expressions.blink, blink)}
        {images.tuft ? (
          <Image
            image={images.tuft}
            x={0}
            y={0}
            width={rig.size}
            height={rig.size}
            transform={tuftTransform}
            sampling={CHARACTER_SAMPLING}
          />
        ) : null}
      </Group>
      <Group transform={effectsTransform}>
        <StatusEffects timeline={timeline} clock={clock} />
      </Group>
    </CharacterFrame>
  );
}
