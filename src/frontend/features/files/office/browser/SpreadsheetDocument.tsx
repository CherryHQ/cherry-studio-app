import { useCallback, useEffect, useState } from 'react';

import { officeDiagnostic, type OfficeDiagnostic } from '../officeDiagnostics';
import type { OfficeRendererProps } from './OfficeDocumentContent';
import { toOfficeCellSelection } from './spreadsheet/cellSelection';
import { echartsChartRenderer } from './spreadsheet/charts/EchartsChartRenderer';
import type { WorkbookRenderModel } from './spreadsheet/renderModel';
import { visibleWorkbookSheets } from './spreadsheet/visibleWorkbookSheets';
import { createWorkbookImageUrls } from './spreadsheet/workbookImages';
import { parseWorkbook } from './spreadsheet/worker/parseWorkbook';
import XlsxGrid, { type SelectedCellInfo } from './spreadsheet/XlsxGrid';

export function SpreadsheetDocument({
  bytes,
  fileName,
  spreadsheetView: { zoom, sheet: sheetIndex },
  labels,
  onStatus,
  onSelection,
}: OfficeRendererProps) {
  const [workbook, setWorkbook] = useState<WorkbookRenderModel | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    // The WebView is already a separate process from the native UI; leaving or retrying unmounts it,
    // so the parser runs here without a Worker. The native loading overlay covers this document area.
    let cancelled = false;
    let images: ReturnType<typeof createWorkbookImageUrls> | undefined;
    void (async () => {
      let stage: OfficeDiagnostic['stage'] = 'xlsx-parse';
      try {
        // Copy so Strict Mode/retry can reuse the source bytes after ExcelJS reads them.
        const model = await parseWorkbook(bytes.slice().buffer, fileName);
        if (cancelled) return;
        if (model.sheets.length && model.sheets.every((sheet) => sheet.hidden)) {
          model.warnings.push('All worksheets are hidden; showing the first worksheet');
        }
        model.sheets = visibleWorkbookSheets(model.sheets);
        if (!model.sheets.length) throw new Error('XLSX has no sheets');
        for (const warning of model.warnings.slice(0, 20)) {
          onStatus({ warning: true, diagnostic: officeDiagnostic('xlsx-warning', warning) });
        }
        stage = 'xlsx-images';
        images = createWorkbookImageUrls(model.images);
        setImageUrls(images.urls);
        setWorkbook(model);
      } catch (error) {
        if (!cancelled)
          onStatus({ phase: 'error', error: 'failed', diagnostic: officeDiagnostic(stage, error) });
      }
    })();
    return () => {
      cancelled = true;
      images?.dispose();
    };
  }, [bytes, fileName, onStatus]);

  useEffect(() => {
    if (!workbook) return;
    // Signal ready after the grid commits; render/effect failures go through OfficeErrorBoundary.
    onStatus({
      phase: 'ready',
      sheets: workbook.sheets.map((sheet) => sheet.name),
      warning: workbook.warnings.length > 0,
    });
  }, [workbook, onStatus]);
  const selectCell = useCallback(
    (info: SelectedCellInfo | null) => {
      void onSelection(sheetIndex, toOfficeCellSelection(info)).catch(() => {});
    },
    [onSelection, sheetIndex],
  );
  const reportWarning = useCallback(
    () =>
      onStatus({
        warning: true,
        diagnostic: officeDiagnostic('xlsx-images', 'Embedded image could not be decoded'),
      }),
    [onStatus],
  );

  const sheet = workbook?.sheets[sheetIndex];
  return workbook && sheet ? (
    <XlsxGrid
      key={sheetIndex}
      sheet={sheet}
      styles={workbook.styles}
      imageUrls={imageUrls}
      zoom={zoom / 100}
      labels={labels}
      onSelectCell={selectCell}
      onWarning={reportWarning}
      renderChart={echartsChartRenderer.render}
    />
  ) : null;
}
