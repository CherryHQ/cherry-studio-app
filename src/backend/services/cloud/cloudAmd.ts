import * as z from 'zod';

import { CloudAccessError } from '@/shared/contracts/cloud';

export const CLOUD_AMD_STATUS_PATH = '/api/v1/amd/desktop/status';
/** Product credentials may be sent only to the relative API target advertised by this model. */
export function cloudActivationPath(target: string | null, origin: string): string {
  if (
    !target?.startsWith('/') ||
    target.startsWith('//') ||
    target.includes('?') ||
    /[\\#\s]/.test(target)
  )
    throw new CloudAccessError('unavailable');
  const url = new URL(target, origin);
  if (url.origin !== origin || url.pathname + url.search !== target)
    throw new CloudAccessError('unavailable');
  return target;
}

const entrySchema = z.object({ entry_url: z.url({ protocol: /^https$/ }) });

export function readCloudActivationEntry(data: unknown): string {
  const entry = entrySchema.safeParse(data);
  if (!entry.success) throw new CloudAccessError('unavailable');
  const { entry_url: href } = entry.data;
  const url = new URL(href);
  if (url.username || url.password || !url.hash) throw new CloudAccessError('unavailable');
  return href;
}
