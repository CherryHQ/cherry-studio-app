import type { ChatBackend } from './chat';
import type { CherryInBackend } from './cherryin';
import type { McpBackend } from './mcp';
import type { ModelsBackend } from './models';
import type { OAuthBackend } from './oauth';
import type { PaintingsBackend } from './paintings';
import type { PermissionsBackend } from './permissions';
import type { ProfileBackend } from './profile';
import type { ProvidersBackend } from './providers';
import type { WebSearchBackend } from './webSearch';

export interface Backend {
  readonly chat: ChatBackend;
  readonly cherryin: CherryInBackend;
  readonly mcp: McpBackend;
  readonly models: ModelsBackend;
  readonly oauth: OAuthBackend;
  readonly paintings: PaintingsBackend;
  readonly permissions: PermissionsBackend;
  readonly profile: ProfileBackend;
  readonly providers: ProvidersBackend;
  readonly webSearch: WebSearchBackend;
}

export type BackendModuleKey = keyof Backend;
export type BackendModule<TKey extends BackendModuleKey> = Backend[TKey];
