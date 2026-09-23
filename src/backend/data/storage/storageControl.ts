import * as z from 'zod';

import type { RestoreOutcome } from '@/shared/contracts/backup';

export const StorageIdSchema = z.union([z.literal('legacy'), z.string().uuid()]);
export const StorageControlSchema = z.strictObject({
  version: z.literal(1),
  current: StorageIdSchema,
  pending: z
    .strictObject({
      id: z.string().uuid(),
      processId: z.string().uuid(),
      phase: z.enum(['staged', 'activating']),
    })
    .optional(),
  failedProcessId: z.string().uuid().optional(),
  cleanupProcessId: z.string().uuid().optional(),
  lastResult: z.enum(['restored', 'rolled-back']).optional(),
});

export type StorageControl = z.infer<typeof StorageControlSchema>;

export function selectBootStorage(
  control: StorageControl,
  processId: string,
): {
  control: StorageControl;
  storageId: string;
  restoring: boolean;
  resetCaches: boolean;
  restartRequired: boolean;
  /** Set only on the boot that settles a restore, so it is reported once. */
  outcome?: RestoreOutcome;
} {
  const pending = control.pending;
  if (control.failedProcessId === processId) {
    return {
      control,
      storageId: control.current,
      restoring: false,
      resetCaches: false,
      restartRequired: true,
    };
  }
  if (!pending) {
    const { failedProcessId, ...settled } = control;
    return {
      control: settled,
      storageId: control.current,
      restoring: false,
      resetCaches: Boolean(failedProcessId),
      restartRequired: false,
      ...(failedProcessId && { outcome: 'rolled-back' as const }),
    };
  }
  if (pending.phase === 'staged' && pending.processId === processId) {
    return {
      control,
      storageId: control.current,
      restoring: false,
      resetCaches: false,
      restartRequired: true,
    };
  }
  if (pending.phase === 'activating' && pending.processId !== processId) {
    const { pending: _pending, ...previous } = control;
    return {
      control: { ...previous, lastResult: 'rolled-back' },
      storageId: control.current,
      restoring: false,
      resetCaches: true,
      restartRequired: false,
      outcome: 'rolled-back',
    };
  }
  return {
    control: { ...control, pending: { ...pending, processId, phase: 'activating' } },
    storageId: pending.id,
    restoring: true,
    resetCaches: true,
    restartRequired: false,
  };
}
