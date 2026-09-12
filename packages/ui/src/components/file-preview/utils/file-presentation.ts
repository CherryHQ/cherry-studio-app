import FileIcon from '@cherrystudio/app-icons/icons/file';
import FileCode2Icon from '@cherrystudio/app-icons/icons/file-code-2';
import FileJsonIcon from '@cherrystudio/app-icons/icons/file-json';
import FileSpreadsheetIcon from '@cherrystudio/app-icons/icons/file-spreadsheet';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import FileType2Icon from '@cherrystudio/app-icons/icons/file-type-2';
import PresentationIcon from '@cherrystudio/app-icons/icons/presentation';

import type { FilePreviewFile } from '../file-preview.types';

// Icon choices and extension groups follow desktop's composer/tokenView/
// fileTokenPresentation.tsx. Category colors use Mobile's theme-aware tokens.
const fileVisualPresets = {
  word: {
    icon: FileType2Icon,
    iconClassName: 'text-tag-blue-foreground',
    extensions: ['doc', 'docx'],
  },
  excel: {
    icon: FileSpreadsheetIcon,
    iconClassName: 'text-tag-green-foreground',
    extensions: ['csv', 'xls', 'xlsx'],
  },
  powerpoint: {
    icon: PresentationIcon,
    iconClassName: 'text-tag-amber-foreground',
    extensions: ['ppt', 'pptx'],
  },
  pdf: {
    icon: FileTextIcon,
    iconClassName: 'text-tag-red-foreground',
    extensions: ['pdf'],
  },
  markdown: {
    icon: FileTextIcon,
    iconClassName: 'text-muted-foreground',
    extensions: ['markdown', 'md', 'mdx'],
  },
  json: {
    icon: FileJsonIcon,
    iconClassName: 'text-tag-blue-foreground',
    extensions: ['json', 'jsonl'],
  },
  code: {
    icon: FileCode2Icon,
    iconClassName: 'text-tag-blue-foreground',
    extensions: [
      'css',
      'go',
      'html',
      'java',
      'js',
      'jsx',
      'py',
      'rs',
      'ts',
      'tsx',
      'xml',
      'yaml',
      'yml',
    ],
  },
  text: {
    icon: FileTextIcon,
    iconClassName: 'text-tag-blue-foreground',
    extensions: ['log', 'text', 'txt'],
  },
  document: {
    icon: FileTextIcon,
    iconClassName: 'text-muted-foreground',
    extensions: [],
  },
  fallback: {
    icon: FileIcon,
    iconClassName: 'text-muted-foreground',
    extensions: [],
  },
} as const;

type FileVisualPreset = (typeof fileVisualPresets)[keyof typeof fileVisualPresets];

const fileVisualPresetByExtension = new Map<string, FileVisualPreset>(
  Object.values(fileVisualPresets).flatMap((preset) =>
    preset.extensions.map((extension) => [extension, preset] as const),
  ),
);

export function fileVisualPreset(file: FilePreviewFile): FileVisualPreset {
  const extensionIndex = file.displayName.lastIndexOf('.');
  const extension =
    extensionIndex > 0 ? file.displayName.slice(extensionIndex + 1) : file.extensionLabel;

  const preset = fileVisualPresetByExtension.get(extension.toLowerCase());
  if (preset) return preset;
  if (file.kind === 'pdf') return fileVisualPresets.pdf;
  if (file.kind === 'markdown') return fileVisualPresets.markdown;
  if (file.kind === 'html') return fileVisualPresets.code;
  if (file.kind === 'text') return fileVisualPresets.text;
  if (file.kind === 'document') return fileVisualPresets.document;
  return fileVisualPresets.fallback;
}

export function fileDisplayStem(filename: string): string {
  const extensionIndex = filename.lastIndexOf('.');
  return extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
}
