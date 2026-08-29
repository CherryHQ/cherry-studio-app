import { MobileAgentHost } from '@/backend/ai/agent/host/MobileAgentHost';
import { PiRuntimeService } from '@/backend/ai/agent/runtime/pi/PiRuntimeService';
import { SqliteAgentSessionStore } from '@/backend/ai/agent/sessionStore/SqliteAgentSessionStore';
import { AiService } from '@/backend/ai/AiService';
import { McpRuntimeService } from '@/backend/ai/mcp';
import { CacheService } from '@/backend/data/CacheService';
import { DbService } from '@/backend/data/db/DbService';
import { PreferenceService } from '@/backend/data/PreferenceService';
import { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import { BackgroundActivityManager } from '@/backend/services/backgroundActivity/BackgroundActivityManager';
import { BackgroundReplyRuntime } from '@/backend/services/backgroundReply';
import { JobHandlerRegistry } from '@/backend/services/jobs/JobHandlerRegistry';
import { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import { KeepAliveCoordinator } from '@/backend/services/keepAlive/KeepAliveCoordinator';
import { ProviderRegistryUpdaterService } from '@/backend/services/providers/ProviderRegistryUpdaterService';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import type { ServiceConstructor } from '../lifecycle/types';
import { ResourceScopeCoordinator } from '../resources/ResourceScopeCoordinator';

/**
 * The central service registry.
 *
 * Adding a service is one import plus one line here; the `ServiceRegistry` type
 * and therefore the `application.get()` keys follow automatically. The name a
 * class passes to `@Injectable` must match its key in this object.
 *
 * This is the one file allowed to import concrete classes from `backend/ai`,
 * `backend/services`, and `backend/data`: registration is assembly, so the layer
 * rule is relaxed here and nowhere else.
 *
 * Registration order is documentation only — the dependency graph decides what
 * actually runs when. Keep it in dependency order anyway, so reading top to
 * bottom matches startup.
 */
export const services = {
  ResourceScopeCoordinator,
  CacheService,
  DbService,
  PreferenceService,
  BackgroundActivityEnvironment,
  KeepAliveCoordinator,
  BackgroundActivityManager,
  BackgroundReplyRuntime,
  WebSearchService,
  ProviderRegistryUpdaterService,
  McpRuntimeService,
  AiService,
  AgentSessionStore: SqliteAgentSessionStore,
  AgentRuntime: PiRuntimeService,
  MobileAgentHost,
  JobHandlerRegistry,
  JobRuntime,
} as const;

/** Service name to instance type, derived from `services`. */
export type ServiceRegistry = {
  [K in keyof typeof services]: InstanceType<(typeof services)[K]>;
};

/** Constructors to register with a host, in declaration order. */
export const serviceList: readonly ServiceConstructor[] = Object.values(services);
