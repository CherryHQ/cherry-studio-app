import type { ToolEntry as RuntimeToolEntry } from '@cherrystudio/ai-runtime/tools';
import type { RequestContext as RuntimeRequestContext } from '@cherrystudio/ai-runtime/tools';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';

import type { SystemPermissionState } from '@/backend/services/permissions';
import type { PermissionPreferenceKey } from '@/shared/data/preference';

export type { ToolDefer } from '@cherrystudio/ai-runtime/tools';

export type DeviceToolAccess = Readonly<
  Record<
    PermissionPreferenceKey,
    {
      mode: 'never' | 'ask' | 'always';
      status: SystemPermissionState;
    }
  >
>;

export interface ToolApplyScope {
  readonly assistant?: Assistant;
  readonly deviceAccess: DeviceToolAccess;
  readonly platform: string;
}

export type ToolEntry = RuntimeToolEntry<ToolApplyScope>;
export type RequestContext = RuntimeRequestContext<Assistant>;
