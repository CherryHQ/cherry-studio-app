import type { AppUpdateChannel, AppUpdateRelease } from '@/shared/contracts/appUpdate';

export const appUpdateQueryKeys = {
  requiredVersion: ['appUpdate', 'requiredVersion'] as const,
  latest: (channel: AppUpdateChannel | null) => ['appUpdate', channel] as const,
  notes: (release: AppUpdateRelease | null, language: string) =>
    [
      'appUpdate',
      'notes',
      release?.id ?? null,
      language,
      release?.channel === 'app-store' ? release.storeUrl : null,
    ] as const,
};
