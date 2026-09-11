# Painting Templates

The catalog, localized names/prompts, and WebP previews are copied from Cherry Studio desktop's
`resources/data/painting-templates` at commit `e131f495a9af593ec873bea34b935e97d644f586`.

Source catalog tree SHA-256: `ec3d0bc385d67515c8d35016401dbd47e7f9020cbea1a53a63ba7f53c31983b9`
(sorted relative paths and file bytes, each followed by a NUL byte).

The desktop names, prompts, and images remain unchanged. When syncing the catalog, update the
static image imports in `paintingTemplates.ts`; its catalog tests protect their correspondence.

Mobile creates from the template's default prompt. A collapsed entry below the creation options
opens a single editor for the complete prompt. Each `${...}` value is materialized when the editor
draft is initialized; subsequent edits apply directly to the full text for this creation only.
Closing the template discards that draft. Creation enqueues the existing painting job before
navigating to the painting receipt. Mobile-owned requirements in `paintingTemplates.ts` declare the
explicit prompt aspect ratios and templates that need a reference image. The selected model's defaults are seeded
with the closest supported ratio or pixel size; controls unrelated to composition retain their
defaults. Models without geometry controls keep their defaults and receive the ratio in the prompt.
The doodle-shadow template requires a reference photo and an image-input model. Other reference
images are optional user-selected library imports; template previews are never submitted as inputs.
