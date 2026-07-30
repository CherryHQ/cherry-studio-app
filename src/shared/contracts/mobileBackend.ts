import type { AssistantsBackend } from './assistants';
import type { ChatBackend } from './chat';
import type { FilesBackend } from './files';
import type { McpBackend } from './mcp';
import type { ModelsBackend } from './models';
import type { PaintingsBackend } from './paintings';
import type { PermissionsBackend } from './permissions';
import type { PinsBackend } from './pins';
import type { PreferencesBackend } from './preferences';
import type { ProfileBackend } from './profile';
import type { ProvidersBackend } from './providers';
import type { TopicsBackend } from './topics';
import type { WebSearchBackend } from './webSearch';

export interface MobileBackend {
  readonly assistants: AssistantsBackend;
  readonly chat: ChatBackend;
  readonly files: FilesBackend;
  readonly mcp: McpBackend;
  readonly models: ModelsBackend;
  readonly paintings: PaintingsBackend;
  readonly permissions: PermissionsBackend;
  readonly pins: PinsBackend;
  readonly preferences: PreferencesBackend;
  readonly profile: ProfileBackend;
  readonly providers: ProvidersBackend;
  readonly topics: TopicsBackend;
  readonly webSearch: WebSearchBackend;
}

export type MobileBackendModuleKey = keyof MobileBackend;
export type MobileBackendModule<TKey extends MobileBackendModuleKey> = MobileBackend[TKey];
