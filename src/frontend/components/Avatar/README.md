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
- `AgentAvatar` renders an Agent's image, then explicit desktop emoji or the built-in Cherry emoji, then the robot emoji
  default (including unnamed drafts). It stays round across these presentations.
- `AvatarImagePicker` owns the shared camera/library and square-crop interaction while leaving
  persistence to its caller.
- `AvatarPickerField` is the block an editing form opens with — a centred avatar over its caption,
  both inside one `AvatarImagePicker` trigger. It takes the avatar as `children` because what an
  unset one falls back to is domain knowledge: an Agent's robot emoji, a provider's built-in logo.
- `ProfileAvatarImage` resolves the persisted user avatar for display-only surfaces.
- `ProfileEditableAvatar` adds a camera or pencil badge for avatar-editing surfaces.

Callers outside this module import from `@/frontend/components/Avatar`. Uploaded provider avatars
are read and written through `@/frontend/hooks/useProviderAvatar`, whose shared store keeps every
mounted avatar in sync after an edit; the files themselves are owned by the backend providers
module.
