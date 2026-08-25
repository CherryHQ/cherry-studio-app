import type {
  RequestContext as RuntimeRequestContext,
  ToolEntry as RuntimeToolEntry,
} from '@cherrystudio/ai-runtime/tools';

import type { DevicePermissionScope, SystemPermissionState } from '@/shared/contracts';
import type { Assistant } from '@/shared/data/types/assistant';

export type { ToolDefer } from '@cherrystudio/ai-runtime/tools';

export type DeviceToolAccess = Readonly<Record<DevicePermissionScope, SystemPermissionState>>;

export interface ToolApplyScope {
  readonly assistant?: Assistant;
  readonly deviceAccess: DeviceToolAccess;
  readonly platform: string;
}

export type ToolEntry = RuntimeToolEntry<ToolApplyScope>;
export type RequestContext = RuntimeRequestContext<Assistant>;
