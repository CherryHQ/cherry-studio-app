import { useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import {
  DiagnosticError,
  type DiagnosticBundleInput,
  type DiagnosticInspection,
  type DiagnosticRange,
  type DiagnosticSavedBundle,
  type DiagnosticUploadResult,
} from '@/shared/contracts/diagnostics';
import { loggerService } from '@/shared/core/logger/LoggerService';

type UploadOutcome = Exclude<DiagnosticUploadResult, { status: 'busy' }>;
type Outcome = UploadOutcome | DiagnosticSavedBundle;
const logger = loggerService.withContext('DiagnosticBundle');

export function useDiagnosticBundle(range: DiagnosticRange) {
  const module = useBackendModule('diagnostics');
  const { t } = useTranslation();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [inspection, setInspection] = useState<{
    range: DiagnosticRange;
    refreshKey: number;
    data?: DiagnosticInspection;
    failed?: boolean;
  }>();
  const [operation, setOperation] = useState<'export' | 'upload' | 'save' | 'discard' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const retainedId = useRef<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (retainedId.current)
        void module
          .discardUpload({ bundleId: retainedId.current })
          .catch((error) => logger.warn('Failed to discard closed diagnostic upload', { error }));
    };
  }, [module]);

  useEffect(() => {
    let active = true;
    void module.inspect(range).then(
      (data) => {
        if (active) setInspection({ range, refreshKey, data });
      },
      (error) => {
        logger.warn('Failed to inspect diagnostic sources', { error });
        if (active) setInspection({ range, refreshKey, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [module, range, refreshKey]);

  const showBusy = () =>
    toast.show({ label: t('settings.about.diagnostics.errors.busy'), variant: 'danger' });

  async function run(kind: NonNullable<typeof operation>, action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setOperation(kind);
    try {
      await action();
    } catch (error) {
      logger.error('Diagnostic operation failed', { error, operation: kind });
      if (mounted.current)
        toast.show({
          label:
            error instanceof DiagnosticError
              ? t(`settings.about.diagnostics.errors.${error.code}`)
              : t('settings.about.diagnostics.errors.operationFailed'),
          variant: 'danger',
        });
    } finally {
      busy.current = false;
      if (mounted.current) setOperation(null);
      else if (retainedId.current)
        void module
          .discardUpload({ bundleId: retainedId.current })
          .catch((error) =>
            logger.warn('Failed to discard unmounted diagnostic upload', { error }),
          );
    }
  }

  function acceptUpload(result: DiagnosticUploadResult) {
    if (result.status === 'busy') {
      if (mounted.current) showBusy();
      return;
    }
    retainedId.current = result.status === 'uploaded' ? null : result.bundleId;
    if (mounted.current) setOutcome(result);
  }

  return {
    inspection:
      inspection?.range === range && inspection.refreshKey === refreshKey
        ? inspection.data
        : undefined,
    inspectionFailed:
      inspection?.range === range &&
      inspection.refreshKey === refreshKey &&
      inspection.failed === true,
    isBusy: operation !== null,
    operation,
    outcome,
    savedUri,
    refresh: () => setRefreshKey((value) => value + 1),
    showBusy,
    exportBundle: (input: DiagnosticBundleInput) =>
      run('export', async () => {
        const result = await module.exportBundle(input);
        if (!mounted.current) return;
        if (result.status === 'busy') {
          showBusy();
          return;
        }
        if (result.status === 'saved') {
          setOutcome(result);
          toast.show({ label: t('settings.about.diagnostics.saved'), variant: 'success' });
        }
      }),
    uploadBundle: (input: DiagnosticBundleInput, description: string) =>
      run('upload', async () => {
        acceptUpload(await module.uploadBundle({ ...input, description }));
      }),
    retry: () =>
      run('upload', async () => {
        if (retainedId.current)
          acceptUpload(await module.retryUpload({ bundleId: retainedId.current }));
      }),
    save: () =>
      run('save', async () => {
        if (!retainedId.current) return;
        const result = await module.saveUploadBundle({ bundleId: retainedId.current });
        if (!mounted.current) return;
        if (result.status === 'busy') showBusy();
        if (result.status === 'saved') {
          setSavedUri(result.filePath);
          toast.show({ label: t('settings.about.diagnostics.saved'), variant: 'success' });
        }
      }),
    reset: () =>
      run('discard', async () => {
        if (retainedId.current) {
          const result = await module.discardUpload({ bundleId: retainedId.current });
          if (result.status === 'busy') {
            showBusy();
            return;
          }
        }
        retainedId.current = null;
        if (mounted.current) {
          setOutcome(null);
          setSavedUri(null);
          setRefreshKey((value) => value + 1);
        }
      }),
  };
}
