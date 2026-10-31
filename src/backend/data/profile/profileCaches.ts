import { Directory, Paths } from 'expo-file-system';

import { DIAGNOSTIC_SCREENSHOT_DIRECTORY } from '@/shared/contracts/diagnostics';

/** Disposable content shared by older runtimes; canonical profile data is never removed. */
const CONTENT_DIRECTORIES = [
  'FilePreviewImages',
  'PdfText',
  'mcp-tool-catalog',
  'RemoteAttachments',
  'ImageEdits',
  'ImageExports',
  'FileExports',
  'DocumentExport',
  'DocumentExportStitch',
  'HtmlConversion',
  'OfficeJobs',
  'WecomFiles',
  'SkillStaging',
  'backups',
  'Diagnostics',
  DIAGNOSTIC_SCREENSHOT_DIRECTORY,
  // Expo's temporary picker/manipulation copies can also contain user attachments.
  'ImagePicker',
  'DocumentPicker',
  'ImageManipulator',
];

/** Run before profile stores/readers open, after the previous JS runtime has stopped. */
export function resetProfileCaches(): void {
  for (const name of CONTENT_DIRECTORIES) {
    const directory = new Directory(Paths.cache, name);
    if (directory.exists) directory.delete();
  }
  for (const entry of Paths.cache.list()) {
    if (/^(?:mcp-[\da-f-]{36}|backup-schema-[\da-f-]{36})$/.test(entry.name)) entry.delete();
  }
}
