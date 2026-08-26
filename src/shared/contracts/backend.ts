import type { AgentProtocol } from './agent';
import type { FileModule } from './file';
import type { McpModule } from './mcp';
import type { ModelsModule } from './models';
import type { PaintingsModule } from './paintings';
import type { PermissionsModule } from './permissions';
import type { ProfileModule } from './profile';
import type { ProvidersModule } from './providers';
import type { WebSearchModule } from './webSearch';

export interface Backend {
  readonly agent: AgentProtocol;
  readonly file: FileModule;
  readonly mcp: McpModule;
  readonly models: ModelsModule;
  readonly paintings: PaintingsModule;
  readonly permissions: PermissionsModule;
  readonly profile: ProfileModule;
  readonly providers: ProvidersModule;
  readonly webSearch: WebSearchModule;
}

export type BackendModuleKey = keyof Backend;
export type BackendModule<TKey extends BackendModuleKey> = Backend[TKey];
