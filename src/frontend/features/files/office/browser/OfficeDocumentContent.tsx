import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ComponentType } from 'react';

import type { BuiltinOfficeFileType } from '@/shared/utils/documentFileTypes';

import { officeDiagnostic } from '../officeDiagnostics';
import { INITIAL_OFFICE_STATUS, OFFICE_CHUNK_BYTES, officeSourceLimit } from '../officePreview';
import type { OfficeDocumentProps, OfficeStatus } from '../officePreview';
import { installOfficeContentPolicy } from './documentSecurity';
import { OfficeErrorBoundary } from './OfficeErrorBoundary';

import './officePreview.css';

export type OfficeRendererProps = Omit<
  OfficeDocumentProps,
  'dom' | 'getSize' | 'readChunk' | 'onStatus' | 'onOpenLink'
> & {
  bytes: Uint8Array<ArrayBuffer>;
  onStatus: (patch: Partial<OfficeStatus>) => void;
};

export function OfficeDocumentContent({
  type,
  Renderer,
  getSize,
  readChunk,
  onSelection,
  onStatus,
  onOpenLink,
  ...props
}: OfficeDocumentProps & {
  type: BuiltinOfficeFileType;
  Renderer: ComponentType<OfficeRendererProps>;
}) {
  const [bytes, setBytes] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const statusRef = useRef(INITIAL_OFFICE_STATUS);
  const nativeCallbacks = useRef({
    getSize,
    readChunk,
    onSelection,
    onStatus,
    onOpenLink,
  });
  useLayoutEffect(() => {
    nativeCallbacks.current = {
      getSize,
      readChunk,
      onSelection,
      onStatus,
      onOpenLink,
    };
  });
  // Expo recreates action proxies whenever native props arrive. Keep renderer effects independent
  // of toolbar/status updates, while every invocation still reaches the latest native action.
  const selectCell = useCallback<OfficeDocumentProps['onSelection']>(
    (sheet, selection) => nativeCallbacks.current.onSelection(sheet, selection),
    [],
  );
  useLayoutEffect(
    () =>
      installOfficeContentPolicy((url) => {
        void nativeCallbacks.current.onOpenLink(url).catch(() => {});
      }),
    [],
  );
  const updateStatus = useCallback((patch: Partial<OfficeStatus>) => {
    const previous = statusRef.current;
    if (previous.phase === 'error') return;
    if (
      Object.entries(patch).every(([key, value]) => previous[key as keyof OfficeStatus] === value)
    )
      return;
    const next = { ...previous, ...patch, warning: previous.warning || patch.warning === true };
    statusRef.current = next;
    void nativeCallbacks.current.onStatus(next).catch(() => {});
  }, []);
  useEffect(() => {
    const fail = (event: ErrorEvent) =>
      updateStatus({
        phase: 'error',
        busy: false,
        error: 'failed',
        diagnostic: officeDiagnostic('browser-error', event.error ?? new Error(event.message)),
      });
    const reject = (event: PromiseRejectionEvent) =>
      updateStatus({
        phase: 'error',
        busy: false,
        error: 'failed',
        diagnostic: officeDiagnostic('browser-rejection', event.reason),
      });
    // React boundaries do not catch timers, ResizeObserver callbacks or promise rejections.
    window.addEventListener('error', fail);
    window.addEventListener('unhandledrejection', reject);
    return () => {
      window.removeEventListener('error', fail);
      window.removeEventListener('unhandledrejection', reject);
    };
  }, [updateStatus]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const size = await nativeCallbacks.current.getSize();
        if (cancelled) return;
        if (size === -1 || size > officeSourceLimit(type)) {
          updateStatus({ phase: 'error', error: 'tooLarge' });
          return;
        }
        if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid Office size');
        const data = new Uint8Array(size);
        for (let offset = 0; offset < size; offset += OFFICE_CHUNK_BYTES) {
          const length = Math.min(OFFICE_CHUNK_BYTES, size - offset);
          const encoded = await nativeCallbacks.current.readChunk(offset, length);
          if (cancelled) return;
          const binary = atob(encoded);
          if (binary.length !== length) throw new Error('Incomplete Office transfer');
          for (let i = 0; i < length; i++) data[offset + i] = binary.charCodeAt(i);
        }
        setBytes(data);
      } catch (error) {
        if (!cancelled)
          updateStatus({
            phase: 'error',
            error: 'failed',
            diagnostic: officeDiagnostic('read', error),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, updateStatus]);

  const { colors } = props;
  const style = {
    '--paper': colors.paper,
    '--ink': colors.ink,
    '--chrome-background': colors.background,
    '--chrome-foreground': colors.foreground,
    '--border': colors.border,
    // Cell selection and default hyperlink ink sit on fixed document paper.
    '--primary': colors.ink,
    // Spreadsheet defaults belong to the document canvas, including in dark mode.
    '--background': colors.paper,
    '--foreground': colors.ink,
  } as CSSProperties;
  return (
    <main className="office-document" style={style}>
      <OfficeErrorBoundary onStatus={updateStatus}>
        {bytes ? (
          <Renderer {...props} bytes={bytes} onSelection={selectCell} onStatus={updateStatus} />
        ) : null}
      </OfficeErrorBoundary>
    </main>
  );
}
