# Painting Templates

The catalog, localized names/prompts, and WebP previews are copied from Cherry Studio desktop's
`resources/data/painting-templates` at commit `e131f495a9af593ec873bea34b935e97d644f586`.

Source catalog tree SHA-256: `ec3d0bc385d67515c8d35016401dbd47e7f9020cbea1a53a63ba7f53c31983b9`
(sorted relative paths and file bytes, each followed by a NUL byte).

The desktop names, prompts, and images remain unchanged. When syncing the catalog, update the
static image imports in `paintingTemplates.ts`; its catalog tests protect their correspondence.

Selecting a template previews its image and full default prompt. "Try it" opens the existing
painting composer with that prompt prefilled. Each `${...}` value is materialized into the same
text for the preview and draft. Users adjust the prompt, model, generation settings, and reference
photos in the composer before sending. Edits do not change the bundled template, and preview
images are never attached to the draft.
