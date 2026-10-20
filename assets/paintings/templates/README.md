# Painting Templates

The catalog, localized names/prompts, and WebP previews are copied from Cherry Studio desktop's
`resources/data/painting-templates` at commit `e131f495a9af593ec873bea34b935e97d644f586`.

Source catalog tree SHA-256: `ec3d0bc385d67515c8d35016401dbd47e7f9020cbea1a53a63ba7f53c31983b9`
(sorted relative paths and file bytes, each followed by a NUL byte).

The desktop names, prompts, and images remain unchanged. When syncing the catalog, update the
static image imports in `paintingTemplates.ts`; its catalog tests protect their correspondence.

`presentation.json` is mobile-owned and sits beside the desktop files. For each template it gives
the stage category, a one-line summary in the two prompt languages, and how a photo joins the
request: `photoSlot` is the position of the `${...}` value whose subject a photo can replace, and
`requiresPhoto` marks a prompt that already asks for an uploaded photo. Slot positions are the same
in both languages; the template tests protect that.

Using a template shows each `${...}` value as an editable field. Blank fields keep the default, a
photo-backed slot names the photo's subject instead, and the photo itself is attached as the
reference image. Edits do not change the bundled template, and preview images are never attached
to a request.
