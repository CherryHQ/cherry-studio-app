# Avatar

This module owns the app-level avatar adapters shared across independent feature domains. CherryUI's
`Avatar` owns generic shape, clipping, image, fallback, and badge composition; this module resolves
Cherry product data and presentation rules before composing that primitive.

## Public Interface

- `BrandAvatar`, `BrandAvatarIcon`, and `BrandAvatarPhoto` apply provider/model brand fallback and
  icon inset rules.
- `ModelAvatar` resolves a model icon from its model and provider records.
- `ProfileAvatarImage` resolves the persisted user avatar for display-only surfaces.
- `ProfileEditableAvatar` adds a camera or pencil badge for avatar-editing surfaces.

Callers outside this module import from `@/frontend/components/avatar`. Provider avatar persistence
and lookup remain feature-owned under settings.
