import '@cherrystudio/file-preview/styles.css';
import './page.css';
/* oxlint-disable import/default -- Vite `?raw` imports expose the file source as the default export. */
import pdfWorkerSource from '@cherrystudio/file-preview/assets/pdf.worker.js?raw';
import xlsxWorkerSource from '@cherrystudio/file-preview/assets/xlsx.worker.js?raw';
/* oxlint-enable import/default */
import type { PreviewSource } from '@cherrystudio/file-preview/core';
import {
  Preview,
  type PreviewDiagnostic,
  type PreviewOptions,
  type PreviewResources,
} from '@cherrystudio/file-preview/react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';

import { PageBridge, post } from './page-bridge';
import {
  FILE_PREVIEW_PAGE_GLOBAL,
  type FilePreviewRenderOptions,
  type HostMessage,
} from './protocol';

declare global {
  interface Window {
    [FILE_PREVIEW_PAGE_GLOBAL]?: { receive: (message: HostMessage) => void };
  }
}

const bridge = new PageBridge();
const workerUrls: Partial<Record<'pdf' | 'xlsx', string>> = {};

const resources: PreviewResources = {
  createWorker: (kind) => {
    // One object URL per kind: the source is immutable and every preview gets its own worker.
    workerUrls[kind] ??= URL.createObjectURL(
      new Blob([kind === 'pdf' ? pdfWorkerSource : xlsxWorkerSource], { type: 'text/javascript' }),
    );
    return new Worker(workerUrls[kind], { type: 'module' });
  },
  readPdfResource: (kind, name) => bridge.readPdfResource(kind, name),
};

function describe(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  const text =
    detail instanceof Error
      ? `${detail.name}: ${detail.message}${detail.stack ? `\n${detail.stack}` : ''}`
      : String(detail);
  return text.slice(0, 4096);
}

function reportDiagnostic({ level, code, context, message, detail }: PreviewDiagnostic): void {
  post({
    type: 'diagnostic',
    level,
    code,
    context: context.slice(0, 256),
    message: message.slice(0, 4096),
    detail: describe(detail),
  });
}

/**
 * Below this page width a 256px side outline would leave too little room for pages, so the PDF
 * outline floats over them instead. Phones in either orientation stay below it; tablets keep the panel.
 */
const OVERLAY_OUTLINE_MAX_WIDTH = 640;

const baseOptions = {
  bottomInset: 'content',
  docx: { initialZoom: 'fit-width', normalizeSymbolBullets: true },
  xlsx: { opaqueHeaders: true },
} satisfies PreviewOptions;
// Stable references: an options change re-renders without reopening, but identity churn is wasted work.
const layoutOptions: Record<'panel' | 'overlay', PreviewOptions> = {
  panel: { ...baseOptions, pdf: { outlineLayout: 'panel' } },
  overlay: { ...baseOptions, pdf: { outlineLayout: 'overlay' } },
};

function currentLayoutOptions(): PreviewOptions {
  return layoutOptions[window.innerWidth < OVERLAY_OUTLINE_MAX_WIDTH ? 'overlay' : 'panel'];
}

let currentSource: PreviewSource | null = null;
let lastRender: FilePreviewRenderOptions | null = null;

function sourceFor(info: FilePreviewRenderOptions['source']): PreviewSource {
  // Theme and locale updates re-render with the same source, so the open document survives them.
  if (currentSource?.id !== info.id) {
    currentSource = { ...info, open: (signal) => bridge.open(signal) };
  }
  return currentSource;
}

const root = createRoot(document.getElementById('root')!);

function render(options: FilePreviewRenderOptions): void {
  lastRender = options;
  document.documentElement.style.colorScheme = options.isDark ? 'dark' : 'light';
  document.documentElement.style.backgroundColor = options.style['--background'] ?? '';
  root.render(
    <Preview
      className={options.isDark ? 'dark' : undefined}
      locale={options.locale}
      onDiagnostic={reportDiagnostic}
      onError={(error) =>
        post({ type: 'error', code: error.code, message: error.message.slice(0, 4096) })
      }
      onRequestOpen={(reason) => post({ type: 'requestOpen', reason })}
      options={currentLayoutOptions()}
      resources={resources}
      source={sourceFor(options.source)}
      style={options.style as CSSProperties}
    />,
  );
}

// Rotation and split-screen resizes can cross the outline threshold.
window.addEventListener('resize', () => {
  if (lastRender) render(lastRender);
});

window[FILE_PREVIEW_PAGE_GLOBAL] = {
  receive: (message) => {
    if (message.type === 'render') render(message);
    else bridge.receive(message);
  },
};

post({ type: 'ready' });
