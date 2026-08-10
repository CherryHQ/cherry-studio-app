import type { ChatModule } from './chat';
import type { CherryInModule } from './cherryin';
import type { FileModule } from './file';
import type { McpModule } from './mcp';
import type { ModelsModule } from './models';
import type { OAuthModule } from './oauth';
import type { PaintingsModule } from './paintings';
import type { PermissionsModule } from './permissions';
import type { ProfileModule } from './profile';
import type { ProvidersModule } from './providers';
import type { WebSearchModule } from './webSearch';

export interface Backend {
  readonly chat: ChatModule;
  readonly cherryin: CherryInModule;
  readonly file: FileModule;
  readonly mcp: McpModule;
  readonly models: ModelsModule;
  readonly oauth: OAuthModule;
  readonly paintings: PaintingsModule;
  readonly permissions: PermissionsModule;
  readonly profile: ProfileModule;
  readonly providers: ProvidersModule;
  readonly webSearch: WebSearchModule;
}

export type BackendModuleKey = keyof Backend;
export type BackendModule<TKey extends BackendModuleKey> = Backend[TKey];
