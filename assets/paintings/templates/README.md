# Painting Templates

The catalog, localized names/prompts, and WebP previews are copied from Cherry Studio desktop's
`resources/data/painting-templates` at commit `e131f495a9af593ec873bea34b935e97d644f586`.

Source catalog tree SHA-256: `ec3d0bc385d67515c8d35016401dbd47e7f9020cbea1a53a63ba7f53c31983b9`
(sorted relative paths and file bytes, each followed by a NUL byte).

`locales/fields-*.json` is Mobile-owned: each template ID maps to translated field labels in the
order of its `${...}` prompt values. The desktop names, prompts, and images remain unchanged.
When syncing the catalog, update the static image imports in `paintingTemplates.ts` and these
field labels together; its catalog tests protect their correspondence.

Mobile presents a one-use creation form. Field changes do not modify the bundled template. The
form substitutes values literally, uses the selected model's default generation parameters, and
enqueues the existing painting job before navigating to the painting receipt. Reference images
are user-selected library imports; template previews are never submitted as image inputs.
