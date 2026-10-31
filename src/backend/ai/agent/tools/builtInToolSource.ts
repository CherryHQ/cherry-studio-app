import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
/**
 * The Host's built-in tool catalog, resolved once per turn.
 *
 * Snapshot resolution in miniature (agent-tools-and-resources.md): the Host asks
 * for the tools a turn may use, and the source projects only the capabilities
 * that this model can call, this platform implements,
 * this device can still grant, and this app has configured. Everything it
 * returns is executable; a capability that fails any gate is absent rather than
 * present and broken. A permission the OS can still request keeps the tool
 * offered as `ask`; execution prompts after in-app approval. HealthKit read
 * access remains unknown after prompting, so queries can return no data.
 *
 * Resolution is per turn on purpose. Permissions and the drawing-model setting
 * change outside Cherry, so a catalog cached across turns would offer tools the
 * user just revoked.
 */
import { Platform } from 'react-native';

import type { AiUsageAttributionResolver } from '@/backend/ai/AiService';
import { agentService } from '@/backend/data/services/AgentService';
import type { ModelService } from '@/backend/data/services/ModelService';
import { fileContent } from '@/backend/services/file/fileContent';
import { createJsSandbox, type JsSandbox } from '@/backend/services/jsSandbox';
import { paintingFileStorage } from '@/backend/services/paintings/paintingFileStorage';
import { devicePermissions } from '@/backend/services/permissions';
import {
  canRequestDevicePermission,
  canUseDevicePermission,
  type PermissionStatuses,
} from '@/shared/contracts';
import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { isDataApiError } from '@/shared/data/api/errors';
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
import { createAgentManagementTools, type AgentManagementData } from './agentManagementTools';
import { type AskUserQuestion, createAskUserQuestionTool } from './askUserQuestionTool';
import {
  createCalendarTools,
  createHealthTools,
  createLocationTools,
  createReminderTools,
  type DeviceToolDependencies,
} from './device';
import { createEditFileTool } from './editFileTool';
import {
  createFileLibraryManagementTools,
  type FileLibraryTrashAccess,
} from './fileLibraryManagementTools';
import { createFileLibraryTools } from './fileLibraryTools';
import { officeFiles } from './officeFiles';
import { createOfficeTools } from './officeTools';
import {
  type ConfiguredPaintingModel,
  createGenerateImageTool,
  type PaintingToolDependencies,
  resolveConfiguredPaintingModel,
} from './painting';
import { createReadFileTool } from './readFileTool';
import { createRunJsTool } from './runJsTool';
import { createSshTool, type SshToolAccess } from './sshTool';
import { createWebTools, type WebSearchToolDependencies } from './web';
import { WorkspaceFileAccess } from './workspaceFileAccess';
import { createWriteFileTool } from './writeFileTool';

const logger = loggerService.withContext('BuiltInToolSource');

const WEB_SEARCH_PROVIDER_PREFERENCE_KEYS = {
  fetchUrls: 'chat.web_search.default_fetch_urls_provider',
  searchKeywords: 'chat.web_search.default_search_keywords_provider',
} as const;

export type DeviceAccess = Readonly<PermissionStatuses>;

type WebSearchAvailability = Readonly<Record<WebSearchCapability, boolean>>;

/** Everything outside the tool definitions that decides what a turn may use. */
export type BuiltInToolScope = {
  deviceAccess: DeviceAccess;
  paintingModel: ConfiguredPaintingModel | null;
  platform: string;
  webSearchAvailability: WebSearchAvailability;
};

export type { TurnFileScope, TurnToolResources } from '../resources/managedFileResolver';

export type SystemCapabilitySource = {
  /** The tools this turn may use; empty when the model cannot call any. */
  getTools(input: {
    workspaceFolderId?: string | null;
    sessionId?: string;
    agentId?: string;
    /** The Host's response channel for `ask_user_question`. */
    askUser: AskUserQuestion;
    documentParserMode: DocumentParserMode;
    model: RuntimeModel;
    acceptsImages: boolean;
    resources: TurnToolResources;
    /** Attribution for provider calls a tool makes; read when the tool runs. */
    resolveUsageAttribution?: AiUsageAttributionResolver;
  }): Promise<readonly RuntimeTool[]>;
};

export type SystemCapabilitySourceDependencies = DeviceToolDependencies &
  WebSearchToolDependencies & {
    agents: AgentManagementData;
    trash: FileLibraryTrashAccess;
    /** Null on clients built without the native sandbox, omitting JS and Office tools. */
    jsSandbox: JsSandbox | null;
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
  ssh?: SshToolAccess;
  ai: PaintingToolDependencies['ai'];
  model: Pick<ModelService, 'getById'>;
  preference: PaintingToolDependencies['preference'];
  webSearch: WebSearchToolDependencies['webSearch'];
  trash: FileLibraryTrashAccess;
};

export function createSystemCapabilitySource(
  services: SystemCapabilityServices,
  overrides: Partial<SystemCapabilitySourceDependencies> = {},
): SystemCapabilitySource {
  return {
    async getTools({
      workspaceFolderId,
      sessionId,
      agentId,
      askUser,
      model,
      acceptsImages,
      resources,
      documentParserMode,
      resolveUsageAttribution,
    }) {
      const deps = resolveDependencies(services, overrides);
      if (!(await deps.supportsToolCalling(model))) {
        // Handing tools to a model that cannot call them fails the whole turn.
        return [];
      }

      const scope = await resolveScope(deps);
      const fileAccess = new WorkspaceFileAccess(workspaceFolderId ?? null, resources);
      const workspaceName = workspaceFolderId
        ? (await fileAccess.library.folder(workspaceFolderId))?.name
        : undefined;
      const catalog = createCatalog(
        deps,
        scope,
        resources,
        documentParserMode,
        resolveUsageAttribution,
        agentId,
        askUser,
        fileAccess,
        workspaceName,
        acceptsImages,
      );
      if (sessionId && services.ssh?.isAvailable()) {
        const target = await services.ssh.resolveAgentTarget(sessionId);
        if (target) catalog.set('ssh_execute', createSshTool(services.ssh, sessionId, target));
      }
      return BUILT_IN_TOOL_DESCRIPTORS.flatMap((descriptor) => {
        const policy = resolveApproval(descriptor, scope);
        const tool = catalog.get(descriptor.capabilityId);
        return policy && tool
          ? [
              bindTurnResources(
                {
                  ...tool,
                  ...policy,
                  effect: descriptor.effect ?? 'write',
                  // Only this explicitly scoped user grant can promote SSH approval.
                  ...(descriptor.capabilityId === 'ssh_execute' ? { approval: tool.approval } : {}),
                },
                resources,
              ),
            ]
          : [];
      });
    },
  };
}

export type ResolvedToolPolicy = {
  approval: RuntimeTool['approval'];
  autoApprovalEligible: boolean;
};

/**
 * Application policy is shared by every Agent. `null` means the tool is absent
 * for this turn.
 * A requestable permission keeps the tool present as `ask`, so in-app approval
 * precedes the system prompt and cannot be bypassed by global auto mode.
 */
export function resolveApproval(
  descriptor: BuiltInToolDescriptor,
  scope: BuiltInToolScope,
): ResolvedToolPolicy | null {
  if (!isPlatformSupported(descriptor, scope.platform)) {
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

  const available = descriptor.permissionScopes.map(
    (permission) =>
      canUseDevicePermission(permission, scope.deviceAccess[permission]) ||
      canRequestDevicePermission(scope.deviceAccess[permission]),
  );
  if (descriptor.permissionMatch === 'any' ? !available.some(Boolean) : !available.every(Boolean)) {
    return null;
  }
  if (
    descriptor.permissionScopes.some((permission) =>
      canRequestDevicePermission(scope.deviceAccess[permission]),
    )
  ) {
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
  documentParserMode: DocumentParserMode,
  resolveUsageAttribution: AiUsageAttributionResolver | undefined,
  agentId: string | undefined,
  askUser: AskUserQuestion,
  fileAccess: WorkspaceFileAccess,
  workspaceName: string | undefined,
  acceptsImages: boolean,
): Map<string, RuntimeTool> {
  const deviceDeps: DeviceToolDependencies = { devicePermissions: deps.devicePermissions };
  const tools = [
    createAskUserQuestionTool(askUser),
    ...createAgentManagementTools(deps.agents, agentId),
    createEditFileTool(
      {
        createTextEntry: fileContent.createTextEntry,
        readAsBytes: managedFileResolver.readAsBytes,
        resolveAvailable: managedFileResolver.resolveAvailable,
        rewriteTextEntry: fileContent.rewriteTextEntry,
      },
      resources,
      fileAccess,
    ),
    createReadFileTool(
      managedFileResolver,
      resources,
      documentParserMode,
      fileAccess,
      acceptsImages,
    ),
    createWriteFileTool(fileContent, fileAccess),
    ...createFileLibraryTools(
      fileAccess,
      managedFileResolver,
      documentParserMode,
      workspaceName,
      acceptsImages,
    ),
    ...createFileLibraryManagementTools(fileAccess.library, deps.trash),
    // Office jobs read and write their files natively, which older clients cannot do.
    ...(deps.jsSandbox?.files ? createOfficeTools(deps.jsSandbox, officeFiles, fileAccess) : []),
    // Code Mode is the capability's only executor, so it needs the interactive bridge.
    ...(deps.jsSandbox?.startBridge ? [createRunJsTool()] : []),
    ...createCalendarTools(deviceDeps),
    ...createReminderTools(deviceDeps),
    ...createHealthTools(deviceDeps),
    ...createLocationTools(deviceDeps),
    ...createWebTools({ webSearch: deps.webSearch }),
    createGenerateImageTool(
      {
        ...deps.painting,
        files: {
          ...deps.painting.files,
          createInternalEntry: (input) =>
            deps.painting.files.createInternalEntry({ ...input, folderId: fileAccess.folderId }),
        },
      },
      scope.paintingModel,
      resources,
      resolveUsageAttribution,
    ),
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
      let output;
      try {
        output = await tool.execute(call);
      } catch (error) {
        if (isDataApiError(error))
          return {
            value: { status: 'error', code: error.code, message: error.message },
            artifacts: [],
          };
        throw error;
      }
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

async function resolveScope(deps: SystemCapabilitySourceDependencies): Promise<BuiltInToolScope> {
  const [deviceAccess, paintingModel, webSearchAvailability] = await Promise.all([
    resolveDeviceAccess(deps),
    resolveConfiguredPaintingModel(deps.painting).catch((error: unknown) => {
      logger.warn('Drawing model lookup failed; omitting generate_image', error as Error);
      return null;
    }),
    resolveWebSearchAvailability(deps),
  ]);

  return {
    deviceAccess,
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
): Promise<WebSearchAvailability> {
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
  const scopes = [
    ...new Set(
      BUILT_IN_TOOL_DESCRIPTORS.filter((descriptor) =>
        isPlatformSupported(descriptor, deps.platform),
      ).flatMap((descriptor) => descriptor.permissionScopes),
    ),
  ];
  try {
    return await deps.devicePermissions.getStatuses(scopes);
  } catch (error) {
    logger.warn('Device access lookup failed; omitting device tools', { error });
    return {};
  }
}

function resolveDependencies(
  services: SystemCapabilityServices,
  overrides: Partial<SystemCapabilitySourceDependencies>,
): SystemCapabilitySourceDependencies {
  return {
    agents: overrides.agents ?? agentService,
    trash: overrides.trash ?? services.trash,
    devicePermissions: overrides.devicePermissions ?? devicePermissions,
    jsSandbox: overrides.jsSandbox !== undefined ? overrides.jsSandbox : createJsSandbox(),
    painting: overrides.painting ?? productionPaintingDependencies(services),
    platform: overrides.platform ?? Platform.OS,
    preference: overrides.preference ?? services.preference,
    supportsToolCalling:
      overrides.supportsToolCalling ?? ((model) => supportsToolCalling(services.model, model)),
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
    models: services.model,
  };
}

async function supportsToolCalling(
  models: SystemCapabilityServices['model'],
  model: RuntimeModel,
): Promise<boolean> {
  const configured = await models.getById(createUniqueModelId(model.providerId, model.modelId));
  return configured?.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL) ?? false;
}
