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
- `ProviderBrandAvatar` resolves a provider's built-in logo and generated-initial fallback. It does
  not read uploaded avatars, so provider-avatar persistence remains provider-owned.
- `ModelAvatar` resolves a model icon from its model and provider records.
- `AgentAvatar` renders an Agent's image, then its built-in Cherry emoji, then the generated initial
  tile or a neutral bot badge for an unnamed draft. It stays round across these presentations.
- `AvatarImagePicker` owns the shared camera/library and square-crop interaction while leaving
  persistence to its caller.
- `AvatarPickerField` is the block an editing form opens with — a centred avatar over its caption,
  both inside one `AvatarImagePicker` trigger. It takes the avatar as `children` because what an
  unset one falls back to is domain knowledge: an Agent's initial, a provider's built-in logo.
- `ProfileAvatarImage` resolves the persisted user avatar for display-only surfaces.
- `ProfileEditableAvatar` adds a camera or pencil badge for avatar-editing surfaces.

Callers outside this module import from `@/frontend/components/Avatar`. Provider avatar persistence
and lookup remain owned by `features/settings/provider`.
