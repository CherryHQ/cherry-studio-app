/**
 * The Host's built-in tool catalog, resolved once per turn.
 *
 * Snapshot resolution in miniature (agent-tools-and-resources.md): the Host asks
 * for the tools a turn may use, and the source projects only the capabilities
 * that this model can call, this platform implements, this Agent has enabled,
 * this device can still grant, and this app has configured. Everything it
 * returns is executable; a capability that fails any gate is absent rather than
 * present and broken. The one deliberate exception is an OS permission that was
 * never asked for: the tool is offered as `ask`, and its execution triggers the
 * one-shot system prompt after the user approves the call in-app.
 *
 * Resolution is per turn on purpose. Permissions and the drawing-model setting
 * change outside Cherry, so a catalog cached across turns would offer tools the
 * user just revoked.
 */

import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { Platform } from 'react-native';

import { modelService } from '@/backend/data/services/ModelService';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { fileContent } from '@/backend/services/file/fileContent';
import { paintingFileStorage } from '@/backend/services/paintings/paintingFileStorage';
import { devicePermissions } from '@/backend/services/permissions';
import type { DevicePermissionScope, SystemPermissionState } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import {
  type BuiltInToolDescriptor,
  BUILT_IN_TOOL_DESCRIPTORS,
} from '@/shared/data/types/builtInTool';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';
import type { WebSearchCapability } from '@/shared/data/types/webSearch';

import type { TurnToolResources } from '../resources/managedFileResolver';
import { managedFileResolver } from '../resources/managedFileResolver';
import type { RuntimeModel, RuntimeTool } from '../runtime';
import {
  createCalendarTools,
  createHealthTools,
  createLocationTools,
  createReminderTools,
  type DeviceToolDependencies,
} from './device';
import { createEditFileTool } from './editFileTool';
import {
  type ConfiguredPaintingModel,
  createGenerateImageTool,
  type PaintingToolDependencies,
  resolveConfiguredPaintingModel,
} from './painting';
import { createWebTools, type WebSearchToolDependencies } from './web';
import { createWriteFileTool } from './writeFileTool';

const logger = loggerService.withContext('BuiltInToolSource');

const DEVICE_PERMISSION_SCOPES = [
  'calendar.read',
  'calendar.write',
  'health.read',
  'location.read',
  'reminders.read',
  'reminders.write',
] as const satisfies readonly DevicePermissionScope[];

const WEB_SEARCH_PROVIDER_PREFERENCE_KEYS = {
  fetchUrls: 'chat.web_search.default_fetch_urls_provider',
  searchKeywords: 'chat.web_search.default_search_keywords_provider',
} as const;

export type DeviceAccess = Readonly<Record<DevicePermissionScope, SystemPermissionState>>;

type WebSearchAvailability = Readonly<Record<WebSearchCapability, boolean>>;

/** Everything outside the tool definitions that decides what a turn may use. */
export type BuiltInToolScope = {
  deviceAccess: DeviceAccess;
  disabledCapabilities: ReadonlySet<AgentCapability>;
  paintingModel: ConfiguredPaintingModel | null;
  platform: string;
  webSearchAvailability: WebSearchAvailability;
};

export type { TurnFileScope, TurnToolResources } from '../resources/managedFileResolver';

export type SystemCapabilitySource = {
  /** The tools this turn may use; empty when the model cannot call any. */
  getTools(input: {
    disabledCapabilities: readonly AgentCapability[];
    model: RuntimeModel;
    resources: TurnToolResources;
  }): Promise<readonly RuntimeTool[]>;
};

export type SystemCapabilitySourceDependencies = DeviceToolDependencies &
  WebSearchToolDependencies & {
    painting: PaintingToolDependencies;
    platform: string;
    preference: PaintingToolDependencies['preference'];
    supportsToolCalling(model: RuntimeModel): Promise<boolean>;
  };

/**
 * The app services this catalog needs, supplied by whoever constructs it. The
 * module owns its own storage and registry access, but a lifecycle-managed
 * service is passed in: the container replaces instances across host
 * generations, so reaching for one here would capture a stale binding.
 */
export type SystemCapabilityServices = {
  ai: PaintingToolDependencies['ai'];
  preference: PaintingToolDependencies['preference'];
  webSearch: WebSearchToolDependencies['webSearch'];
};

export function createSystemCapabilitySource(
  services: SystemCapabilityServices,
  overrides: Partial<SystemCapabilitySourceDependencies> = {},
): SystemCapabilitySource {
  return {
    async getTools({ disabledCapabilities, model, resources }) {
      const deps = resolveDependencies(services, overrides);
      if (!(await deps.supportsToolCalling(model))) {
        // Handing tools to a model that cannot call them fails the whole turn.
        return [];
      }

      const scope = await resolveScope(deps, new Set(disabledCapabilities));
      const catalog = createCatalog(deps, scope, resources);
      return BUILT_IN_TOOL_DESCRIPTORS.flatMap((descriptor) => {
        const policy = resolveApproval(descriptor, scope);
        const tool = catalog.get(descriptor.capabilityId);
        return policy && tool ? [bindTurnResources({ ...tool, ...policy }, resources)] : [];
      });
    },
  };
}

export type ResolvedToolPolicy = {
  approval: RuntimeTool['approval'];
  autoApprovalEligible: boolean;
};

/**
 * Application policy is shared by every Agent; the Agent contributes only its
 * capability-group deny-list. `null` means the tool is absent for this turn.
 * A permission that was never asked for keeps the tool present as `ask` — the
 * in-app approval is the consent moment before execution fires the one-shot
 * system prompt — and stays ineligible for the global auto mode.
 */
export function resolveApproval(
  descriptor: BuiltInToolDescriptor,
  scope: BuiltInToolScope,
): ResolvedToolPolicy | null {
  if (!isPlatformSupported(descriptor, scope.platform)) {
    return null;
  }
  if (descriptor.agentCapability && scope.disabledCapabilities.has(descriptor.agentCapability)) {
    return null;
  }
  if (descriptor.requiresPaintingModel && !scope.paintingModel) {
    return null;
  }
  if (
    descriptor.requiresWebSearchCapability &&
    !scope.webSearchAvailability[descriptor.requiresWebSearchCapability]
  ) {
    return null;
  }

  const statuses = descriptor.permissionScopes.map((permission) => scope.deviceAccess[permission]);
  if (statuses.some((status) => status !== 'granted' && status !== 'undetermined')) {
    return null;
  }
  if (statuses.some((status) => status === 'undetermined')) {
    return { approval: 'ask', autoApprovalEligible: false };
  }
  return {
    approval: descriptor.defaultApproval,
    autoApprovalEligible: descriptor.autoApprovalEligible,
  };
}

function isPlatformSupported(descriptor: BuiltInToolDescriptor, platform: string): boolean {
  return (
    descriptor.platforms === null ||
    descriptor.platforms.some((candidate) => candidate === platform)
  );
}

/**
 * Instantiated once per turn: the device families are created as groups, and
 * `generate_image` bakes the resolved drawing model into its input schema, so
 * the catalog cannot be a module constant.
 */
function createCatalog(
  deps: SystemCapabilitySourceDependencies,
  scope: BuiltInToolScope,
  resources: TurnToolResources,
): ReadonlyMap<string, RuntimeTool> {
  const deviceDeps: DeviceToolDependencies = { devicePermissions: deps.devicePermissions };
  const tools = [
    createEditFileTool({
      createTextEntry: fileContent.createTextEntry,
      readAsBytes: managedFileResolver.readAsBytes,
      resolveAvailable: managedFileResolver.resolveAvailable,
    }),
    createWriteFileTool(fileContent),
    ...createCalendarTools(deviceDeps),
    ...createReminderTools(deviceDeps),
    ...createHealthTools(deviceDeps),
    ...createLocationTools(deviceDeps),
    ...createWebTools({ webSearch: deps.webSearch }),
    createGenerateImageTool(deps.painting, scope.paintingModel, resources),
  ];
  return new Map(
    tools.flatMap((tool) =>
      tool.ref.source === 'builtin' ? [[tool.ref.capabilityId, tool] as const] : [],
    ),
  );
}

/** Grant validated built-in artifacts before Pi can start its next tool step. */
function bindTurnResources(tool: RuntimeTool, resources: TurnToolResources): RuntimeTool {
  return {
    ...tool,
    async execute(call) {
      const output = await tool.execute(call);
      for (const artifact of output.artifacts) {
        const fileEntryId = FileEntryIdSchema.safeParse(artifact.ref.fileEntryId);
        if (!fileEntryId.success) {
          throw new Error('Built-in tool returned an invalid managed file artifact.');
        }
        resources.grantFile(fileEntryId.data);
      }
      return output;
    },
  };
}

async function resolveScope(
  deps: SystemCapabilitySourceDependencies,
  disabledCapabilities: ReadonlySet<AgentCapability>,
): Promise<BuiltInToolScope> {
  const [deviceAccess, paintingModel, webSearchAvailability] = await Promise.all([
    resolveDeviceAccess(deps),
    disabledCapabilities.has('image')
      ? null
      : resolveConfiguredPaintingModel(deps.painting).catch((error: unknown) => {
          logger.warn('Drawing model lookup failed; omitting generate_image', error as Error);
          return null;
        }),
    resolveWebSearchAvailability(deps, !disabledCapabilities.has('web')),
  ]);

  return {
    deviceAccess,
    disabledCapabilities,
    paintingModel,
    platform: deps.platform,
    webSearchAvailability,
  };
}

/**
 * A web tool is available once its default provider is chosen in Settings.
 * Deeper validity (keys, hosts) stays a call-time concern: the tool result
 * carries the configuration error for the model to relay.
 */
async function resolveWebSearchAvailability(
  deps: SystemCapabilitySourceDependencies,
  enabled: boolean,
): Promise<WebSearchAvailability> {
  if (!enabled) {
    return { fetchUrls: false, searchKeywords: false };
  }
  const [fetchProvider, searchProvider] = await Promise.all([
    readWebSearchProvider(deps, 'fetchUrls'),
    readWebSearchProvider(deps, 'searchKeywords'),
  ]);
  return { fetchUrls: Boolean(fetchProvider), searchKeywords: Boolean(searchProvider) };
}

async function readWebSearchProvider(
  deps: SystemCapabilitySourceDependencies,
  capability: WebSearchCapability,
): Promise<unknown> {
  try {
    return await deps.preference.get(WEB_SEARCH_PROVIDER_PREFERENCE_KEYS[capability]);
  } catch (error) {
    logger.warn('Web search provider lookup failed; omitting the affected tool', {
      capability,
      error,
    });
    return null;
  }
}

async function resolveDeviceAccess(
  deps: SystemCapabilitySourceDependencies,
): Promise<DeviceAccess> {
  const entries = await Promise.all(
    DEVICE_PERMISSION_SCOPES.map(async (scope) => {
      try {
        return [scope, await deps.devicePermissions.getStatusForScope(scope)] as const;
      } catch (error) {
        logger.warn('Device access lookup failed; omitting the affected tools', {
          error,
          scope,
        });
        return [scope, 'unavailable' as const] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as DeviceAccess;
}

function resolveDependencies(
  services: SystemCapabilityServices,
  overrides: Partial<SystemCapabilitySourceDependencies>,
): SystemCapabilitySourceDependencies {
  return {
    devicePermissions: overrides.devicePermissions ?? devicePermissions,
    painting: overrides.painting ?? productionPaintingDependencies(services),
    platform: overrides.platform ?? Platform.OS,
    preference: overrides.preference ?? services.preference,
    supportsToolCalling: overrides.supportsToolCalling ?? supportsToolCalling,
    webSearch: overrides.webSearch ?? services.webSearch,
  };
}

function productionPaintingDependencies(
  services: SystemCapabilityServices,
): PaintingToolDependencies {
  return {
    ai: services.ai,
    files: {
      createInternalEntry: paintingFileStorage.createInternalEntry,
      discard: paintingFileStorage.discard,
      readDataUrl: paintingFileStorage.readDataUrl,
      resolve: fileContent.resolve,
    },
    preference: services.preference,
    providerRegistry: providerRegistryService,
  };
}

async function supportsToolCalling(model: RuntimeModel): Promise<boolean> {
  const configured = await modelService.getById(
    createUniqueModelId(model.providerId, model.modelId),
  );
  return configured?.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL) ?? false;
}
