import type { Tool } from 'ai';
import type { SystemPermissionState } from '@/backend/infrastructure/integrations/devicePermissions';
import type { PermissionPreferenceKey } from '@/shared/data/preference';
import type { Assistant } from '@/shared/data/types/assistant';

export type ToolDefer = 'never' | 'always' | 'auto';

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
  readonly externalWebSearchEnabled: boolean;
  readonly platform: string;
}

export interface ToolEntry {
  readonly name: string;
  readonly namespace: string;
  readonly description: string;
  readonly defer: ToolDefer;
  readonly tool: Tool;
  buildTool?(scope: ToolApplyScope): Tool;
  applies?(scope: ToolApplyScope): boolean;
}

export interface RequestContext {
  readonly requestId: string;
  readonly chatId?: string;
  readonly assistant?: Assistant;
  readonly abortSignal?: AbortSignal;
}
