import type { AppUpdateChannel, DomesticAppStore } from '@/shared/contracts/appUpdate';

export const appUpdateQueryKeys = {
  latest: (channel: AppUpdateChannel | null, store?: DomesticAppStore | null) =>
    channel === 'domestic-stores'
      ? (['appUpdate', channel, store ?? null] as const)
      : (['appUpdate', channel] as const),
  notes: (releaseId: string, language: string) =>
    ['appUpdate', 'notes', releaseId, language] as const,
};
