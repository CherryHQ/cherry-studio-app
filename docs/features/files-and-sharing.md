# Files And Sharing

Managed file library browsing, attaching files to chat drafts, offline document/PDF preview, and
exporting or sharing conversations as Markdown or stitched long PNG images.

## User Entry

- File Library: open sidebar (`testID:main-header-open-sidebar`) -> tap `testID:sidebar-library`
  (`testID:file-library-list`, `testID:file-library-empty`, `testID:file-library-skeleton`,
  `testID:file-library-browse`).
- Attaching files in chat: open composer menu (`testID:composer-menu`) -> file picker
  (`testID:file-picker`, `testID:file-picker-list`, `testID:file-picker-upload`,
  `testID:file-picker-create-folder`, `testID:file-picker-add`).
- Sharing/exporting: triggered from message toolbar (`testID:assistant-message-toolbar`) or
  conversation share selection.

## Verification Driver

- Focused Jest suites:
  - `pnpm test:app -- src/frontend/features/files/utils/__tests__/filePreviewBridge.test.ts --runInBand`
  - `pnpm test:app -- src/frontend/features/sharing/utils/__tests__/stitchCapturedPngPages.test.ts --runInBand`
- Device acceptance: `agent-device` walkthrough browsing `testID:file-library-list`, opening a
  document preview, and exporting a conversation without UI freeze.

## Observable Acceptance

- File library renders either `testID:file-library-list` or `testID:file-library-empty` cleanly
  without sticking on `testID:file-library-skeleton`.
- Large PDF/document preview streams byte ranges through `FilePreviewBridge` without OOM or broken
  cleanup when closed mid-read.
- Exporting long conversations produces valid Markdown or stitched PNG images and releases
  temporary cache files after completion or cancellation.

## Known Pitfalls

- File imports copy into sandbox-managed storage (`importManagedFile`); never persist source-device
  absolute paths or temporary `blob:`/`content:` URIs.
- Android system share/export sheets and iOS share sheets are native OS surfaces; verify cancellation
  returns cleanly to the calling screen without leaking capture sessions.
