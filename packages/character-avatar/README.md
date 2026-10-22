# @cherrystudio/character-avatar

Animated avatar characters as a self-contained capability. It knows nothing about Agents, storage,
translations or the app's tool framework; the app owns those integrations.

| Entry | Contents | Runs on |
| --- | --- | --- |
| `.` | Engine: `CharacterPlayer`, `CharacterStill`, `useSpriteImages`, types | React Native (Skia, Reanimated) |
| `./manifest` | Character and pack manifests (zod), layer names | Anywhere |
| `./layers` | `validateCharacterLayers`: pack checks and anchor derivation | Skia |
| `./cover` | `drawCharacterCover`: the idle character on a round swatch, as PNG bytes | Skia |
| `./skill` | `character-studio` Skill files for an Agent that designs characters | Anywhere |

The app keeps generic pieces in `src` (`image_process`, pixel helpers) and the integration shells
(library storage, avatar editor, Agent tools, and on-demand design guidance).

## Engine input

A `CharacterSprite`: a rig (anchor points in canvas pixels) plus one image source per layer.
Every layer is a square of `rig.size` pixels on a transparent background, aligned to the others.

| Layer | Required | Role |
| --- | --- | --- |
| `idle`, `blink`, `thinking`, `waiting`, `done`, `error` | yes | Face per state; only the face should differ |
| `tuft` | no | A hair tuft that springs around `rig.tuft.pivot` |

`rig.frame` is the square shown in the avatar circle and `rig.neck` the pivot for squash, tilt and
hair trailing. `rig.sways` marks hair masses that swing on their own. Pose translations in
`motion.ts` use a 700-wide reference frame and are rescaled to each rig.

## Motion contract

Purpose: report what an Agent is doing at sizes where only body language reads. Running and
waiting loop because they report ongoing progress; completion and failure play once from the
moment the status changes, then settle. Idle stays almost still: slow breathing and sparse blinks.
Trigger: the `status` prop. Interruption: every change blends from the pose on screen; a run that
had already finished when the player mounted starts at rest. Reduced motion: `CharacterStill` with
the status face.

## Implementation notes

- Poses are pure functions of time, so the UI thread can evaluate a moment in the past for trailing.
- Status start times are stamped inside the frame callback: the JS thread only sees a stale copy of
  the UI-thread clock. The clock uses `frame.timestamp`, which stays monotonic when the callback is
  re-registered (`timeSinceFirstFrame` restarts).
- Textures are sampled with mipmaps; without them, large art downscaled to 24 pt aliases.
