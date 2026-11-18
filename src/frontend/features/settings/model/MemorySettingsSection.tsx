import { Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import type { MemoryMaintenanceStatus, MemoryOperationResult } from '@/shared/contracts/memory';

const STATUS_KEYS = {
  idle: 'settings.memory.status.idle',
  queued: 'settings.memory.status.queued',
  running: 'settings.memory.status.running',
  completed: 'settings.memory.status.completed',
  failed: 'settings.memory.status.failed',
  cancelled: 'settings.memory.status.cancelled',
} as const;

/** Keep maintenance polling and volatile control state below the model-picker screen. */
export function MemorySettingsSection() {
  const memory = useBackendModule('memory');
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const [generate, setGenerate] = usePreference('memory.generate.enabled');
  const [organize, setOrganize] = usePreference('memory.organize.enabled');
  const [busy, setBusy] = useState(false);
  const pendingPreview = useRef<string | undefined>(undefined);
  const status = useQuery({
    queryKey: ['memory', 'maintenance'],
    queryFn: async (): Promise<MemoryMaintenanceStatus> =>
      (await memory.status()) ?? { status: 'idle' },
    refetchInterval: 10_000,
  });
  useEffect(
    () => () => {
      if (pendingPreview.current) memory.cancelPreview(pendingPreview.current);
    },
    [memory],
  );
  const failed = () => toast.show({ label: t('settings.memory.failed'), variant: 'danger' });
  const change = async (kind: 'generate' | 'organize', value: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await (kind === 'generate'
        ? setGenerate(value, { optimistic: false })
        : setOrganize(value, { optimistic: false }));
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };
  const saved = (result: MemoryOperationResult, kind: 'clear' | 'recover') => {
    toast.show({
      label: t(
        result.confirmed
          ? kind === 'clear'
            ? 'settings.memory.cleared'
            : 'settings.memory.saved'
          : 'settings.memory.partial',
        { count: result.applied },
      ),
      variant: result.confirmed ? 'success' : 'danger',
    });
  };
  const apply = async (kind: 'clear' | 'recover', token: string) => {
    setBusy(true);
    try {
      saved(await memory[kind](token), kind);
      await status.refetch();
    } catch {
      failed();
    } finally {
      memory.cancelPreview(token);
      if (pendingPreview.current === token) pendingPreview.current = undefined;
      setBusy(false);
    }
  };
  const confirm = async (kind: 'clear' | 'recover') => {
    if (busy) return;
    setBusy(true);
    try {
      const preview: { token: string; files?: { path: string; conflict: boolean }[] } | null =
        kind === 'clear' ? await memory.previewClear() : await memory.previewRecovery();
      if (!preview) {
        toast.show({ label: t('settings.memory.nothingToRestore') });
        return;
      }
      pendingPreview.current = preview.token;
      alert.confirm({
        title: t(kind === 'clear' ? 'settings.memory.clear' : 'settings.memory.restore'),
        confirmLabel: t(kind === 'clear' ? 'common.clear' : 'settings.memory.restore'),
        description: [
          t(kind === 'clear' ? 'settings.memory.clearConfirm' : 'settings.memory.restoreConfirm'),
          ...(preview.files?.map((file) => file.path) ?? []),
        ].join('\n'),
        role: kind === 'clear' ? 'destructive' : 'default',
        onConfirm: () => {
          void apply(kind, preview.token);
        },
      });
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };
  const organizeNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await memory.organize();
      toast.show({ label: t('settings.memory.queued') });
      await status.refetch();
    } catch {
      failed();
    } finally {
      setBusy(false);
    }
  };
  const last = status.data?.lastResult;
  const detail = status.isError
    ? t('settings.memory.statusLoadFailed')
    : [
        t(STATUS_KEYS[status.data?.status ?? 'idle']),
        ...(last
          ? [
              t('settings.memory.lastResult', {
                result: t(STATUS_KEYS[last.outcome]),
                time: new Date(last.finishedAt).toLocaleString(i18n.language),
              }),
            ]
          : []),
      ].join('\n');
  return (
    <Section title={t('settings.memory.title')} footer={t('settings.memory.modelUsage')}>
      <Section.SwitchItem
        label={t('settings.memory.generate')}
        value={generate}
        disabled={busy}
        onValueChange={(value) => {
          void change('generate', value);
        }}
      />
      <Section.SwitchItem
        label={t('settings.memory.organizeAutomatically')}
        value={organize}
        disabled={busy}
        onValueChange={(value) => {
          void change('organize', value);
        }}
      />
      <Section.Item
        label={t('settings.memory.status')}
        description={detail}
        showChevron={false}
        onPress={
          status.isError
            ? () => {
                void status.refetch();
              }
            : undefined
        }
      />
      <Section.Item
        label={t('settings.memory.organizeNow')}
        disabled={busy || status.data?.status === 'running'}
        showChevron={false}
        onPress={() => {
          void organizeNow();
        }}
      />
      <Section.Item
        label={t('settings.memory.restore')}
        disabled={busy}
        showChevron={false}
        onPress={() => {
          void confirm('recover');
        }}
      />
      <Section.Item
        label={t('settings.memory.clear')}
        disabled={busy}
        destructive
        showChevron={false}
        onPress={() => {
          void confirm('clear');
        }}
      />
    </Section>
  );
}
