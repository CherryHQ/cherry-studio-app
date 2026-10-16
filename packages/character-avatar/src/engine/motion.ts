/**
 * Character motion as pure functions of time, so the UI thread can evaluate any moment (and a
 * moment slightly in the past for trailing hair) without stored animation state.
 *
 * Purpose: the header avatar reports what the Agent is doing at sizes where only body language
 * reads. Running and waiting loop because they report ongoing progress; completion and failure
 * play once from the moment the status changes and then settle. Idle stays almost still: slow
 * breathing plus sparse blinks keep the character alive without competing with content.
 * Interruption: every status change blends from the pose on screen. Reduced motion: still art.
 */

/** Status codes on the UI thread; order matches `MOTION_STATUSES`. */
export const MOTION_STATUSES = ['idle', 'running', 'waiting', 'completed', 'failed'] as const;
export type MotionStatus = (typeof MOTION_STATUSES)[number];

/** Translation is in reference units: a character frame 700 wide; renderers rescale it. */
export const POSE_REFERENCE_SIDE = 700;

export type CharacterPose = {
  x: number;
  y: number;
  /** degrees */
  rotate: number;
  scaleX: number;
  scaleY: number;
  /** degrees, added to the hair tuft spring */
  tuft: number;
  /** degrees, hair masses swing outward (positive) or inward */
  sway: number;
};

export const ONE_SHOT_SECONDS = { completed: 1.6, failed: 1.3 } as const;
export const STATUS_BLEND_SECONDS = 0.28;
const TAU = Math.PI * 2;

function bump(t: number, start: number, end: number) {
  'worklet';
  if (t <= start || t >= end) return 0;
  return Math.sin((Math.PI * (t - start)) / (end - start));
}

function idlePose(clock: number): CharacterPose {
  'worklet';
  const breath = Math.sin((TAU * clock) / 3.6);
  return {
    x: 0,
    y: -2.5 * breath,
    rotate: 0.8 * Math.sin((TAU * clock) / 7.3),
    scaleX: 1 - 0.005 * breath,
    scaleY: 1 + 0.01 * breath,
    tuft: 5 * Math.sin((TAU * clock) / 2.9),
    sway: 1.6 * Math.sin((TAU * clock) / 3.6 + 0.9),
  };
}

function runningPose(t: number): CharacterPose {
  'worklet';
  const bob = Math.abs(Math.sin((Math.PI * t) / 0.85));
  return {
    x: 4 * Math.sin((TAU * t) / 2.2),
    y: -10 * bob,
    rotate: -6 + 2 * Math.sin((TAU * t) / 2.2),
    scaleX: 1 + 0.012 * (1 - bob),
    scaleY: 1 - 0.012 * (1 - bob) + 0.01 * bob,
    tuft: 14 * Math.sin((TAU * t) / 0.85),
    sway: 5 * Math.sin((TAU * t) / 0.85 + 1.2),
  };
}

function waitingPose(t: number): CharacterPose {
  'worklet';
  const period = 1.5;
  const p = t % period;
  const hop = bump(p, 0.08, 0.5);
  const land = bump(p, 0.5, 0.66);
  const crouch = bump(p, 0, 0.1);
  return {
    x: 0,
    y: -42 * hop,
    rotate: 3 * Math.sin((TAU * t) / (period * 2)),
    scaleX: 1 + 0.05 * land + 0.03 * crouch - 0.03 * hop,
    scaleY: 1 - 0.06 * land - 0.04 * crouch + 0.04 * hop,
    tuft: 18 * Math.sin((TAU * p) / 0.5) * Math.exp(-3 * p),
    sway: 7 * hop - 4 * land,
  };
}

function completedPose(t: number): CharacterPose {
  'worklet';
  const first = bump(t, 0.05, 0.5);
  const second = bump(t, 0.62, 0.95);
  const land = bump(t, 0.5, 0.62) + bump(t, 0.95, 1.1);
  const fade = Math.max(0, 1 - t / ONE_SHOT_SECONDS.completed);
  return {
    x: 0,
    y: -70 * first - 34 * second,
    rotate: 7 * Math.sin(TAU * 2 * t) * fade,
    scaleX: 1 - 0.05 * first - 0.03 * second + 0.07 * land,
    scaleY: 1 + 0.07 * first + 0.04 * second - 0.08 * land,
    tuft: 30 * Math.sin(TAU * 2.5 * t) * fade,
    sway: 10 * (first + second) - 6 * land,
  };
}

function failedPose(t: number): CharacterPose {
  'worklet';
  const decay = Math.exp(-2.6 * t);
  const droop = bump(t, 0, ONE_SHOT_SECONDS.failed);
  return {
    x: 16 * Math.sin(TAU * 4.5 * t) * decay,
    y: 12 * droop,
    rotate: -5 * droop + 3 * Math.sin(TAU * 4.5 * t) * decay,
    scaleX: 1 + 0.02 * droop,
    scaleY: 1 - 0.03 * droop,
    tuft: -22 * droop,
    sway: -5 * droop,
  };
}

/** Pose of one status `elapsed` seconds after it began; one-shots fall back to idle when done. */
export function statusPose(status: number, elapsed: number, clock: number): CharacterPose {
  'worklet';
  if (status === 1) return runningPose(elapsed);
  if (status === 2) return waitingPose(elapsed);
  if (status === 3 && elapsed < ONE_SHOT_SECONDS.completed) return completedPose(elapsed);
  if (status === 4 && elapsed < ONE_SHOT_SECONDS.failed) return failedPose(elapsed);
  return idlePose(clock);
}

function mix(a: CharacterPose, b: CharacterPose, k: number): CharacterPose {
  'worklet';
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    x: m(a.x, b.x),
    y: m(a.y, b.y),
    rotate: m(a.rotate, b.rotate),
    scaleX: m(a.scaleX, b.scaleX),
    scaleY: m(a.scaleY, b.scaleY),
    tuft: m(a.tuft, b.tuft),
    sway: m(a.sway, b.sway),
  };
}

export type MotionTimeline = {
  status: number;
  since: number;
  previous: number;
  previousSince: number;
};

/** Pose on screen at `clock`, blending out of the previous status so changes never jump. */
export function characterPose(timeline: MotionTimeline, clock: number): CharacterPose {
  'worklet';
  const elapsed = Math.max(0, clock - timeline.since);
  const current = statusPose(timeline.status, elapsed, clock);
  const k = Math.min(1, elapsed / STATUS_BLEND_SECONDS);
  if (k >= 1) return current;
  const eased = k * k * (3 - 2 * k);
  const before = statusPose(timeline.previous, Math.max(0, clock - timeline.previousSince), clock);
  return mix(before, current, eased);
}

/** Sparse blinks: one every ~3–6 s, occasionally doubled; deterministic for a given clock. */
export function isBlinking(clock: number) {
  'worklet';
  const slot = Math.floor(clock / 4.4);
  const hash = Math.abs(Math.sin(slot * 12.9898) * 43758.5453) % 1;
  const local = clock - slot * 4.4 - hash * 2.6;
  return (local >= 0 && local < 0.12) || (hash > 0.7 && local >= 0.24 && local < 0.36);
}
