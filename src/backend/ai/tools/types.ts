import type {
  RequestContext as RuntimeRequestContext,
  ToolEntry as RuntimeToolEntry,
} from '@cherrystudio/ai-runtime/tools';

import type { SystemPermissionState } from '@/backend/services/permissions';
import type { PermissionPreferenceKey } from '@/shared/data/preference';
import type { Assistant } from '@/shared/data/types/assistant';

import type { ConfiguredPaintingModel } from './painting';

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
  readonly paintingModel: ConfiguredPaintingModel | null;
  readonly platform: string;
}

export type ToolEntry = RuntimeToolEntry<ToolApplyScope>;
export type RequestContext = RuntimeRequestContext<Assistant>;
