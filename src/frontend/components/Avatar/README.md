# Avatar

This module owns the app-level avatar adapters shared across independent pages. CherryUI's
`Avatar` owns generic shape, clipping, image, fallback, and badge composition; this module resolves
Cherry product data and presentation rules before composing that primitive.

## Public Interface

- `BrandAvatar`, `BrandAvatarIcon`, and `BrandAvatarPhoto` apply provider/model brand fallback and
  icon inset rules. Lists use the default `rounded` frame with the shared `rounded-md` radius;
  detail, creation, and connection forms pass `circle`. The frame owns clipping. Provider artwork
  with its own background fills the frame; transparent marks use shape-specific insets, and
  first-character backgrounds fill the frame. `BrandAvatarIcon` accepts a resolved light/dark
  source pair so aliases and model-to-provider fallbacks share the actual artwork's layout.
  OpenCode and MiMo compensate for their existing canvas padding at display time.
- `ProviderAvatar` shows a provider's uploaded avatar, then falls back to `ProviderBrandAvatar`.
- `ProviderBrandAvatar` resolves a provider's built-in logo and generated-initial fallback only;
  creation and detail forms use it as the fallback beneath a pending upload.
- `ModelAvatar` resolves a model icon from its model and provider records. When neither the model
  nor its maker has an icon, the hosting provider's uploaded avatar outranks its built-in logo.
- `AgentAvatar` renders an Agent's image, then explicit desktop emoji or the built-in Cherry emoji,
  then the name's initial on the neutral fallback fill, which stays empty for an unnamed draft. It
  stays round across these presentations.
- `AvatarImagePicker` owns the shared camera/library and square-crop interaction while leaving
  persistence to its caller. Agent callers can add the avatar studio action with `onCreate`.
- `AvatarEditor` is the public customization modal. It accepts `source` and returns one opaque
  resource source through `onSave`; callers never carry a recipe or cover pair. Users pick a
  character from the on-device library and a circle colour, preview every execution state, import
  a character pack or delete a character. Saving draws the cover offscreen.
- `AvatarCreation`, inside the editor, owns AI creation: compatible model selection, bounded
  generation consent, candidate selection, approval of one blink sample, remaining expressions,
  and a return to the existing animation preview before applying. Closing cancels the active
  request; the backend keeps completed images in a local draft for resuming or explicit deletion.
- `DynamicAvatar` is the public player. It resolves the resource internally, keeps the cover
  beneath, and animates the recipe while its character is in the library.
- `ActiveAgentAvatar` is reserved for the focused conversation's header. It observes status without
  subscribing to the transcript and is the only live player; other surfaces use `AgentAvatar` with
  the cover.
- `ProfileAvatarImage` resolves the persisted user avatar for display-only surfaces.
- `ProfileEditableAvatar` adds a camera or pencil badge for avatar-editing surfaces.

The app ships no characters. `@cherrystudio/character-avatar` animates any character from data and
validates character packs (see its README); the backend library (`src/backend/services/avatars`)
stores the characters users bring; `utils/characterSprite.ts` adapts a library character to the
engine. A character pack is a ZIP with `character.json` (`CharacterPackManifestSchema`) and one
transparent square PNG or WebP per layer; frame and neck are derived when omitted. Agents can also
design characters through the bundled `character-studio` Skill.

The `avatars.studio` contract owns one draft per device under `avatar-studio`. Each successful image
is checkpointed before the next request. Editing always uses the selected candidate bytes, and the
remaining batch requires a saved sample approval. Framing, pixel difference and silhouette checks
reject structural failures; they do not prove semantic identity, so sample and final visual review
remain explicit user steps. The studio uses the existing image capability and needs no chat model.

Callers outside this module import from `@/frontend/components/Avatar`. Uploaded provider avatars
are read and written through `@/frontend/hooks/useProviderAvatar`, whose shared store keeps every
mounted avatar in sync after an edit; the files themselves are owned by the backend providers
module.
