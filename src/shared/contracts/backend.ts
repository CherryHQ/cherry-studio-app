import type { ChatBackend } from './chat';
import type { McpBackend } from './mcp';
import type { ModelsBackend } from './models';
import type { PaintingsBackend } from './paintings';
import type { PermissionsBackend } from './permissions';
import type { ProfileBackend } from './profile';
import type { ProvidersBackend } from './providers';
import type { WebSearchBackend } from './webSearch';

export interface Backend {
  readonly chat: ChatBackend;
  readonly mcp: McpBackend;
  readonly models: ModelsBackend;
  readonly paintings: PaintingsBackend;
  readonly permissions: PermissionsBackend;
  readonly profile: ProfileBackend;
  readonly providers: ProvidersBackend;
  readonly webSearch: WebSearchBackend;
}

export type BackendModuleKey = keyof Backend;
export type BackendModule<TKey extends BackendModuleKey> = Backend[TKey];
