import { QueryClient } from '@tanstack/react-query';

import type { AppUpdateModule } from '@/shared/contracts/appUpdate';

import { appUpdateQueryOptions } from '../appUpdateQueries';

test('does not immediately retry a failed update check', async () => {
  const client = new QueryClient();
  const error = new Error('Rate limited');
  const check = jest.fn().mockRejectedValue(error);
  const updates = { channel: 'apk', isEnabled: true, check } as unknown as AppUpdateModule;
  try {
    await expect(client.fetchQuery(appUpdateQueryOptions(updates))).rejects.toBe(error);
    expect(check).toHaveBeenCalledTimes(1);
  } finally {
    client.clear();
  }
});
