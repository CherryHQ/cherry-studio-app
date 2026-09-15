import type { DOMProps } from 'expo/dom';

import type { BuiltinOfficeFileType } from '@/shared/utils/documentFileTypes';

import type { OfficeDiagnostic } from './officeDiagnostics';

export const OFFICE_CHUNK_BYTES = 192 * 1024;
export const OFFICE_MIN_ZOOM = 50;
export const OFFICE_MAX_ZOOM = 200;

export function officeSourceLimit(type: BuiltinOfficeFileType): number {
  return (type === 'xlsx' ? 20 : 25) * 1024 * 1024;
}

export type OfficeCommand = { id: number; name: 'zoom' | 'page' | 'sheet'; value: number };
export const OFFICE_CELL_TEXT_LIMIT = 32_768;
export type OfficeCellSelection = {
  address: string;
  text: string;
  formula: string | null;
  formulaState: 'cached' | 'evaluated' | 'unevaluated' | null;
  truncated: boolean;
};
export type OfficeDocumentProps = {
  dom?: DOMProps;
  fileName: string;
  colors: OfficeColors;
  labels: OfficeLabels;
  command: OfficeCommand | null;
  spreadsheetView: { zoom: number; sheet: number };
  getSize: () => Promise<number>;
  readChunk: (offset: number, length: number) => Promise<string>;
  onOpenLink: (url: string) => Promise<void>;
  onStatus: (status: OfficeStatus) => Promise<void>;
  onSelection: (sheet: number, selection: OfficeCellSelection | null) => Promise<void>;
};
export type OfficeStatus = {
  phase: 'loading' | 'ready' | 'error';
  page: number;
  pages: number;
  zoom: number;
  busy: boolean;
  sheets: string[];
  sheet: number;
  warning: boolean;
  error: 'failed' | 'tooLarge' | null;
  diagnostic?: OfficeDiagnostic;
};

export const INITIAL_OFFICE_STATUS: OfficeStatus = {
  phase: 'loading',
  page: 0,
  pages: 0,
  zoom: 100,
  busy: false,
  sheets: [],
  sheet: 0,
  warning: false,
  error: null,
};

export type OfficeLabels = { chart: string; unsupportedChart: string; imageUnavailable: string };
export type OfficeColors = {
  paper: string;
  ink: string;
  background: string;
  foreground: string;
  border: string;
};

/** The bridge accepts ranges only within the already selected document. */
export function isOfficeChunkRange(offset: number, length: number, size: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(length) &&
    offset >= 0 &&
    length > 0 &&
    length <= OFFICE_CHUNK_BYTES &&
    offset + length <= size
  );
}

export function clampOfficeZoom(value: number): number {
  return Math.min(OFFICE_MAX_ZOOM, Math.max(OFFICE_MIN_ZOOM, value));
}

/** Browser progress cannot overwrite native-owned worksheet controls or revive a failed attempt. */
export function mergeOfficeStatus(
  previous: OfficeStatus,
  incoming: OfficeStatus,
  type: BuiltinOfficeFileType,
): OfficeStatus {
  if (previous.phase === 'error') return previous;
  const next =
    type === 'xlsx' ? { ...incoming, zoom: previous.zoom, sheet: previous.sheet } : incoming;
  return next.phase === 'error' ? { ...next, busy: false } : next;
}
