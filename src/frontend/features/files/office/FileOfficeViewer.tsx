import { ContentState, useToast } from '@cherrystudio/ui/components';
import { Directory, Paths } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';
import { z } from 'zod';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  documentFileTypeFromMediaType,
  isBuiltinOfficeFileType,
  type BuiltinOfficeFileType,
} from '@/shared/utils/documentFileTypes';

import { FileViewerHeader } from '../components/FileViewerHeader';
import DocxPreviewDom from './DocxPreviewDom';
import { OfficeCellDetails } from './OfficeCellDetails';
import {
  OFFICE_DIAGNOSTIC_STAGES,
  officeDiagnostic,
  type OfficeDiagnostic,
} from './officeDiagnostics';
import { officeLinkTarget } from './officeLinkPolicy';
import {
  INITIAL_OFFICE_STATUS,
  OFFICE_CELL_TEXT_LIMIT,
  type OfficeCellSelection,
  clampOfficeZoom,
  mergeOfficeStatus,
  officeSourceLimit,
  type OfficeCommand,
  type OfficeStatus,
} from './officePreview';
import { OfficeToolbar } from './OfficeToolbar';
import PptxPreviewDom from './PptxPreviewDom';
import { createOfficeFileReader } from './readOfficeFile';
import XlsxPreviewDom from './XlsxPreviewDom';

const logger = loggerService.withContext('FileOfficeViewer');
const diagnosticSchema = z.object({
  stage: z.enum(OFFICE_DIAGNOSTIC_STAGES),
  name: z.string().max(100),
  message: z.string().max(2000),
  stack: z.string().max(4000),
});
const statusSchema = z.object({
  phase: z.enum(['loading', 'ready', 'error']),
  page: z.int().min(0).max(100_000),
  pages: z.int().min(0).max(100_000),
  zoom: z.number().min(50).max(200),
  busy: z.boolean(),
  sheets: z.array(z.string().max(256)).max(4000),
  sheet: z.int().min(0).max(3999),
  warning: z.boolean(),
  error: z.enum(['failed', 'tooLarge']).nullable(),
  diagnostic: diagnosticSchema.optional(),
});

const selectionSchema = z
  .object({
    address: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/),
    text: z.string().max(OFFICE_CELL_TEXT_LIMIT),
    formula: z.string().max(OFFICE_CELL_TEXT_LIMIT).nullable(),
    formulaState: z.enum(['cached', 'evaluated', 'unevaluated']).nullable(),
    truncated: z.boolean(),
  })
  .nullable();

const OFFICE_DOCUMENTS = { docx: DocxPreviewDom, pptx: PptxPreviewDom, xlsx: XlsxPreviewDom };
// This repository embeds DOM assets (expo-updates is not installed). WKWebView needs access
// to sibling scripts/styles, but never the document store or the whole file:// hierarchy.
const OFFICE_ASSET_ROOT =
  Platform.OS === 'ios' ? new Directory(Paths.bundle, 'www.bundle').uri : undefined;

export function FileOfficeViewer({ file }: { file: ResolvedFile }) {
  const [attempt, setAttempt] = useState(0);
  const type = documentFileTypeFromMediaType(file.entry.mediaType);
  return (
    <>
      <FileViewerHeader file={file} />
      {type && isBuiltinOfficeFileType(type) ? (
        <OfficeBody
          file={file}
          type={type}
          key={attempt}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : null}
    </>
  );
}

function OfficeBody({
  file,
  type,
  onRetry,
}: {
  file: ResolvedFile;
  type: BuiltinOfficeFileType;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [paper, ink, background, foreground, border] = useThemeColor([
    'constant-white',
    'constant-black',
    'background',
    'foreground',
    'border',
  ]);
  const [status, setStatus] = useState(INITIAL_OFFICE_STATUS);
  const [selectedCell, setSelectedCell] = useState<{
    sheet: number;
    value: OfficeCellSelection | null;
  } | null>(null);
  const selection = selectedCell?.sheet === status.sheet ? selectedCell.value : null;
  const uri = file.uri;
  const OfficeDocument = OFFICE_DOCUMENTS[type];
  const [command, setCommand] = useState<OfficeCommand | null>(null);
  const readerRef = useRef<ReturnType<typeof createOfficeFileReader> | null>(null);
  const loggedRef = useRef(new Set<string>());
  const reportDiagnostic = useCallback(
    (diagnostic: OfficeDiagnostic) => {
      const key = `${diagnostic.stage}:${diagnostic.message}`;
      if (loggedRef.current.has(key) || loggedRef.current.size >= 25) return;
      loggedRef.current.add(key);
      const error = new Error(diagnostic.message);
      error.name = diagnostic.name;
      error.stack = diagnostic.stack;
      logger.warn('Office preview diagnostic', error, {
        entryId: file.entry.id,
        type,
        stage: diagnostic.stage,
      });
    },
    [file.entry.id, type],
  );
  const failedRef = useRef(false);
  const shellUrlRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const fail = useCallback(
    (stage: OfficeDiagnostic['stage'], error: unknown) => {
      if (!activeRef.current) return;
      reportDiagnostic(officeDiagnostic(stage, error));
      failedRef.current = true;
      readerRef.current?.dispose();
      setStatus((previous) => ({ ...previous, phase: 'error', busy: false, error: 'failed' }));
    },
    [reportDiagnostic],
  );

  useEffect(() => {
    activeRef.current = true;
    readerRef.current = createOfficeFileReader(uri, type);
    return () => {
      activeRef.current = false;
      readerRef.current?.dispose();
      readerRef.current = null;
    };
  }, [uri, type]);
  useEffect(() => {
    if (status.phase !== 'loading' && !status.busy) return;
    const timer = setTimeout(
      () => fail('deadline', new Error('Office preview exceeded 60 seconds')),
      60_000,
    );
    return () => clearTimeout(timer);
  }, [status.phase, status.busy, fail]);

  const getSize = useCallback(async () => {
    if (!readerRef.current || failedRef.current) throw new Error('Office preview unavailable');
    return readerRef.current.getSize();
  }, []);
  const readChunk = useCallback(async (offset: number, length: number) => {
    if (!readerRef.current || failedRef.current) throw new Error('Office preview unavailable');
    return readerRef.current.readChunk(offset, length);
  }, []);
  const onOpenLink = useCallback(
    async (raw: string) => {
      if (!activeRef.current || failedRef.current || typeof raw !== 'string') return;
      const target = officeLinkTarget(raw);
      if (target?.kind !== 'external') return;
      try {
        if (target.value.startsWith('mailto:')) await Linking.openURL(target.value);
        else await WebBrowser.openBrowserAsync(target.value);
      } catch (error) {
        reportDiagnostic(officeDiagnostic('link', error));
        toast.show({ label: t('fileViewer.office.linkFailed'), variant: 'danger' });
      }
    },
    [reportDiagnostic, t, toast],
  );
  const onStatus = useCallback(
    async (value: OfficeStatus) => {
      if (!activeRef.current || failedRef.current) return;
      const result = statusSchema.safeParse(value);
      if (!result.success) {
        fail('bridge', new Error('Invalid Office status'));
        return;
      }
      if (
        (result.data.page > result.data.pages && result.data.pages > 0) ||
        (result.data.sheets.length > 0 && result.data.sheet >= result.data.sheets.length)
      ) {
        fail('bridge', new Error('Office page or sheet out of bounds'));
        return;
      }
      if (result.data.diagnostic) reportDiagnostic(result.data.diagnostic);
      if (result.data.phase === 'error') {
        failedRef.current = true;
        readerRef.current?.dispose();
      }
      setStatus((previous) => mergeOfficeStatus(previous, result.data, type));
    },
    [fail, reportDiagnostic, type],
  );
  const onSelection = useCallback(
    async (sheet: number, value: OfficeCellSelection | null) => {
      if (!activeRef.current || failedRef.current) return;
      const parsed = selectionSchema.safeParse(value);
      if (!Number.isInteger(sheet) || sheet < 0 || sheet >= 4000 || !parsed.success) {
        fail('bridge', new Error('Invalid Office cell selection'));
        return;
      }
      setSelectedCell({ sheet, value: parsed.data });
    },
    [fail],
  );
  const onCommand = useCallback(
    (name: OfficeCommand['name'], value: number) => {
      if (type === 'xlsx') {
        if (name === 'sheet') setSelectedCell(null);
        setStatus((previous) =>
          name === 'zoom'
            ? { ...previous, zoom: clampOfficeZoom(value) }
            : name === 'sheet'
              ? { ...previous, sheet: Math.min(previous.sheets.length - 1, Math.max(0, value)) }
              : previous,
        );
      } else {
        setCommand((previous) => ({ id: (previous?.id ?? 0) + 1, name, value }));
      }
    },
    [type],
  );

  if (status.phase === 'error')
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ContentState.Error
          title={t('fileViewer.previewFailed')}
          description={
            status.error === 'tooLarge'
              ? t('fileViewer.office.tooLarge', { size: officeSourceLimit(type) / 1024 / 1024 })
              : t('fileViewer.readFailedDescription')
          }
          primaryAction={{ children: t('common.retry'), onPress: onRetry }}
        />
      </View>
    );

  return (
    <View className="flex-1">
      <View className="flex-1">
        <OfficeDocument
          fileName={file.entry.filename}
          colors={{ paper, ink, background, foreground, border }}
          labels={{
            chart: t('fileViewer.office.chart'),
            unsupportedChart: t('fileViewer.office.unsupportedChart'),
            imageUnavailable: t('fileViewer.office.imageUnavailable'),
          }}
          command={command}
          spreadsheetView={{ zoom: status.zoom, sheet: status.sheet }}
          getSize={getSize}
          readChunk={readChunk}
          onOpenLink={onOpenLink}
          onStatus={onStatus}
          onSelection={onSelection}
          dom={{
            useExpoDOMWebView: false,
            unstable_useExpoModulesBridge: false,
            style: { flex: 1, backgroundColor: background },
            originWhitelist: ['*'],
            javaScriptCanOpenWindowsAutomatically: false,
            allowFileAccess: true,
            allowFileAccessFromFileURLs: false,
            allowUniversalAccessFromFileURLs: false,
            allowingReadAccessToURL: OFFICE_ASSET_ROOT,
            contentInsetAdjustmentBehavior: 'never',
            automaticallyAdjustContentInsets: false,
            textZoom: 100,
            mixedContentMode: 'never',
            sharedCookiesEnabled: false,
            thirdPartyCookiesEnabled: false,
            domStorageEnabled: false,
            incognito: true,
            setSupportMultipleWindows: true,
            onOpenWindow: () => {},
            onError: ({ nativeEvent }) =>
              fail('native-webview', new Error(nativeEvent.description)),
            onHttpError: ({ nativeEvent }) =>
              fail('native-webview', new Error(`HTTP ${nativeEvent.statusCode}`)),
            onRenderProcessGone: () =>
              fail('native-webview', new Error('Android renderer terminated')),
            onContentProcessDidTerminate: () =>
              fail('native-webview', new Error('iOS content process terminated')),
            onLoadStart: ({ nativeEvent }) => {
              shellUrlRef.current ??= nativeEvent.url;
            },
            onShouldStartLoadWithRequest: ({ url }) =>
              shellUrlRef.current === null || url === shellUrlRef.current,
            allowsLinkPreview: false,
            mediaPlaybackRequiresUserAction: true,
            webviewDebuggingEnabled: __DEV__,
          }}
        />
        {status.phase === 'loading' ? (
          <View className="absolute inset-0 items-center justify-center bg-background p-6">
            <ContentState.Loading title={t('fileViewer.loading')} />
          </View>
        ) : null}
      </View>
      {status.phase === 'ready' ? (
        <>
          {type === 'xlsx' ? <OfficeCellDetails key={status.sheet} selection={selection} /> : null}
          <OfficeToolbar status={status} onCommand={onCommand} />
        </>
      ) : (
        <View className="pb-safe" />
      )}
    </View>
  );
}
