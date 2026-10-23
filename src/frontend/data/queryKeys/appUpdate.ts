import type { AppUpdateChannel } from '@/shared/contracts/appUpdate';

export const appUpdateQueryKeys = {
  latest: (channel: AppUpdateChannel | null) => ['appUpdate', channel] as const,
  notes: (releaseId: string, language: string) =>
    ['appUpdate', 'notes', releaseId, language] as const,
};
