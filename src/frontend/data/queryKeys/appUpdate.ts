import type { AppUpdateChannel, AppUpdateRelease } from '@/shared/contracts/appUpdate';

export const appUpdateQueryKeys = {
  latest: (channel: AppUpdateChannel | null) => ['appUpdate', channel] as const,
  notes: (release: AppUpdateRelease, language: string) =>
    [
      'appUpdate',
      'notes',
      release.id,
      language,
      release.channel === 'app-store' ? release.storeUrl : null,
    ] as const,
};
