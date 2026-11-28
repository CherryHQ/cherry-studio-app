/**
 * Turn preparation for the Mobile Agent Host: everything between admission
 * and the first durable write. `prepareTurn` is a standalone planning stage
 * over explicit ports — it loads the Session, Agent definition, checkpoint,
 * and history, admits attachments, freezes the tool snapshot, preflights the
 * model, and returns one immutable `TurnPlan`. It performs no writes and
 * publishes no events, so every gate can fail here with zero side effects
 * and the stage is testable without a Host instance.
 */

import type { AiUsageAttribution, AiUsageAttributionResolver } from '@/backend/ai/AiService';
import type { PluginGuideSnapshot } from '@/backend/services/builtInMcp';
import {
  AgentProtocolError,
  type AgentErrorView,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentSessionView,
  type AgentStartSessionInput,
  type AgentSubmitMessageInput,
} from '@/shared/contracts/agent';
import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';
import type { SkillsModule } from '@/shared/contracts/skills';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { createUniqueModelId, parseUniqueModelId } from '@/shared/data/types/model';
import {
  SKILL_ACTIVE_MAX_CHARACTERS,
  SKILL_ACTIVE_MAX_ENTRIES,
  skillContentHashHex,
  type SkillActivation,
} from '@/shared/data/types/skill';
import { applyToolApprovalMode } from '@/shared/utils/agentToolApproval';
import type { AppLanguage } from '@/shared/utils/languages';

import {
  createTurnResourceLedger,
  type ManagedFileResolver,
  type TurnResourceLedger,
} from '../resources/managedFileResolver';
import { raceAbort } from '../runtime';
import type {
  AgentRuntime,
  RuntimeContextCheckpoint,
  RuntimeMcpNamespace,
  RuntimeModelPreflight,
  RuntimeSkillScopeChange,
  RuntimeTool,
  RuntimeWebTools,
} from '../runtime';
import type {
  AgentSessionStore,
  StoredRuntimeTurnContext,
} from '../sessionStore/AgentSessionStore';
import { ASK_USER_QUESTION_TOOL_NAME, type AskUserQuestion } from '../tools/askUserQuestionTool';
import type { SystemCapabilitySource } from '../tools/builtInToolSource';
import type { AgentRuntimeToolResolver } from '../tools/runtimeTools';
import {
  createSkillTools,
  createSkillManagementTools,
  createSkillCreationTool,
  LIST_LOCAL_SKILLS_TOOL_NAME,
  LIST_SKILL_FILES_TOOL_NAME,
  LOAD_SKILL_TOOL_NAME,
  READ_SKILL_FILE_TOOL_NAME,
} from '../tools/skill';
import {
  LOAD_WORKFLOW_TOOL_NAME,
  createLoadWorkflowTool,
  getPluginWorkflows,
  requireLoadedWorkflows,
  restoreLoadedWorkflows,
} from '../tools/workflowTool';
import type { AgentDefinition, AgentDefinitionSource } from './agentDefinitions';
import type { AgentImageGenerationPlan, AgentImageGenerationPort } from './agentImageGeneration';
import { validateRuntimeContextCheckpointCandidate } from './contextCheckpoints';
import {
  createAgentInferenceSnapshot,
  type AgentInferenceModelResolver,
} from './inferenceSnapshot';
import { isSkillActivationCurrent, latestSkillActivations } from './skillHistory';
import {
  EMPTY_SKILL_SCOPE,
  createExpandingSkillScope,
  filterSkillScopeByRevisions,
  type SkillScopeSource,
  type SkillTurnEntry,
  type SkillTurnScope,
} from './skillScope';
import {
  assertAttachmentRequestSupported,
  resolveManagedInput,
  resolveRuntimeContentAttachments,
} from './turnAttachments';
import type { RuntimeAttachmentContents } from './turnRuntimeInput';

const logger = loggerService.withContext('AgentTurnPreparation');

function fail(code: AgentErrorView['code'], message: string, retryable = false): never {
  throw new AgentProtocolError({ code, message, retryable });
}

export type TurnPreparationDependencies = {
  agents: AgentDefinitionSource;
  /** The Host's `ask_user_question` response channel; calls correlate by turn id. */
  askUser: AskUserQuestion;
  appLanguage?(): AppLanguage;
  documentParserMode(): DocumentParserMode;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  imageGeneration?: AgentImageGenerationPort;
  /** The Host keeps the engine binding; preparation consumes that local Runtime. */
  runtime: Pick<AgentRuntime, 'descriptor' | 'preflightModel'>;
  runtimeTools: AgentRuntimeToolResolver;
  /** Optional so tests and hosts without a Skill library prepare turns unchanged. */
  skills?: SkillScopeSource;
  skillWorkflow?: SkillsModule;
  store: Pick<
    AgentSessionStore,
    | 'getLatestContextCheckpoint'
    | 'getSession'
    | 'loadRuntimeTurnContext'
    | 'loadSkillActivations'
    | 'loadWorkflowLoads'
  >;
  systemCapabilities: SystemCapabilitySource;
  webTools?(): Promise<RuntimeWebTools>;
};

type FailedMcpServerState = {
  executionSettingsKey?: string;
  matchesExecutionSettingsKey?(expected: string): Promise<boolean>;
  disabledTools: ReadonlySet<string>;
  resolveEffectiveApproval?(rawToolName: string): Promise<RuntimeTool['approval'] | null>;
};

/** Everything the Host needs to reserve and execute a turn, frozen before the first write. */
export type TurnPlan = {
  agent: AgentDefinition;
  /** Captured before tools resolve; subsequent Session switches do not alter this turn. */
  workspaceFolderId?: string;
  documentParserMode: DocumentParserMode;
  /** False only for a truly empty Session; drives first-message auto-naming. */
  hasMessages: boolean;
  history: AgentMessageView[];
  /**
   * Present only for an explicit answer retry. `resumeParts` is the recorded
   * assistant prefix the replacement execution keeps; it is empty when the
   * answer restarts from the original question alone.
   */
  retry?: { resumeParts: AgentMessagePart[] };
  inferenceSnapshot: ReturnType<typeof createAgentInferenceSnapshot>;
  /** Canonicalized input parts: file parts rewritten to verified managed facts. */
  inputParts: AgentInputPart[];
  modelPreflight: RuntimeModelPreflight | null;
  imageGeneration?: AgentImageGenerationPlan;
  resources: TurnResourceLedger;
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null;
  runtimeContentAttachments: RuntimeAttachmentContents;
  sessionTitle: string;
  tools: readonly RuntimeTool[];
  mcpCatalogVersion?: number;
  mcpNamespaces: readonly RuntimeMcpNamespace[];
  webTools?: RuntimeWebTools;
  pluginGuides: readonly PluginGuideSnapshot[];
  /** Plugin guides loaded earlier in the Session whose connection is still in this turn. */
  workflowInstructions: readonly { key: string; text: string }[];
  /** The Skills usable in this turn, with their pinned revisions. */
  skills: TurnSkillPlan;
  /** Sources whose transient discovery failure removed tools from `tools`. */
  toolDiscoveryFailures?: {
    mcpCapabilitiesAll?: boolean;
    mcpServerIds: ReadonlySet<string>;
    mcpServerStates?: ReadonlyMap<string, FailedMcpServerState>;
    systemCapabilitiesAll: boolean;
    builtinCapabilityIds: ReadonlySet<string>;
  };
  toolDiscoveryWarnings: readonly string[];
  /** The user message parts to reserve, projected from the canonical input. */
  userParts: AgentMessagePart[];
  /** Source captured at admission; the Host binds the reserved message before execution. */
  usageAttribution: TurnUsageAttribution;
};

export type TurnSkillPlan = {
  scope: SkillTurnScope;
  /** Immutable baseline scope prior to in-turn expansions, used for warm recovery. */
  pinnedScope?: SkillTurnScope;
  findAndInstall?: boolean;
  create?: boolean;
  /** Explicitly selected Skills with their instructions already loaded. */
  selected: readonly { entry: SkillTurnEntry; instructions: string }[];
  /** Instructions restored from earlier turns' receipts; they ride with the system prompt. */
  active?: ReadonlyMap<string, { entry: SkillTurnEntry; instructions: string }>;
  /** Selected Skills whose package instructions could not be read during recovery. */
  unreadableSelectedSkillIds?: ReadonlySet<string>;
  /** Previously loaded active Skills whose package instructions could not be read during recovery. */
  unreadableActiveSkillIds?: ReadonlySet<string>;
  /** One or more pinned Skill revisions for the active turn were missing during recovery. */
  incompletePinnedScope?: boolean;
  isLoaded?(skillId: string): boolean;
};

export const EMPTY_TURN_SKILL_PLAN: TurnSkillPlan = Object.freeze({
  scope: EMPTY_SKILL_SCOPE,
  selected: Object.freeze([]),
});

/**
 * Attribution for provider calls that turn tools make on the Host's behalf.
 * Tools are created before the assistant message is reserved, so they hold a
 * resolver rather than a snapshot and read the message reference at call time.
 */
type TurnUsageAttribution = {
  /** Binds the reserved assistant message exactly once. */
  bindMessage(ref: NonNullable<AiUsageAttribution['messageRef']>): void;
  /** Reads the attribution as of now; before binding the message reference is null. */
  resolve: AiUsageAttributionResolver;
};

function createTurnUsageAttribution(
  source: NonNullable<AiUsageAttribution['source']>,
): TurnUsageAttribution {
  const capturedSource = Object.freeze({ ...source });
  let messageRef: AiUsageAttribution['messageRef'] = null;
  return {
    bindMessage(ref) {
      if (messageRef) {
        throw new Error('The turn usage attribution is already bound to a message.');
      }
      messageRef = Object.freeze({ ...ref });
    },
    resolve: () => ({ source: capturedSource, messageRef }),
  };
}

/**
 * Where a turn sits in the message tree and what it may do. `through` is the
 * message the new question follows (null for a first question); omitted, the
 * Session's selected leaf. A multi-model answer limits its tools to reads.
 */
export type TurnScope = {
  through?: string | null;
  readOnlyTools?: boolean;
  recovering?: boolean;
  extraSkillActivations?: readonly SkillActivation[];
  retainedSkillIds?: readonly string[];
  retainedSkillRevisions?: ReadonlyMap<string, string>;
  loadSkillAvailable?: boolean;
  pinnedSkillScope?: SkillTurnScope;
  pinnedSkillRevisions?: ReadonlyMap<string, string>;
  skillScopeChanges?: readonly RuntimeSkillScopeChange[];
};

export async function prepareTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput,
  signal: AbortSignal,
  excludeCheckpointMessageId?: string,
  scope: TurnScope = {},
): Promise<TurnPlan> {
  const documentParserMode = dependencies.documentParserMode();
  const { sessionId } = parsed;
  const session = await raceAbort(dependencies.store.getSession(sessionId), signal);
  if (!session) {
    fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
  }
  const configuredAgent = await raceAbort(
    dependencies.agents.getAgent(session.agentId, parsed.modelId ?? session.model),
    signal,
  );
  if (!configuredAgent) {
    fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
  }

  const { storedTurnContext, runtimeContextCheckpoint } = await loadTurnContext(
    dependencies,
    sessionId,
    signal,
    excludeCheckpointMessageId,
    scope.through,
  );

  return prepareResolvedTurn(
    dependencies,
    parsed,
    session,
    configuredAgent,
    storedTurnContext,
    runtimeContextCheckpoint,
    documentParserMode,
    signal,
    scope,
  );
}

/**
 * Resolve the stored compaction checkpoint and the history it anchors. Every
 * working-copy rebuild — a submission without a current copy, or a retry —
 * reads history through this path, so no caller imports a full transcript the
 * Runtime has already summarized.
 */
export async function loadTurnContext(
  dependencies: Pick<TurnPreparationDependencies, 'store'>,
  sessionId: string,
  signal: AbortSignal,
  /** A retry skips the answer it replaces: that summary describes discarded content. */
  excludeCheckpointMessageId?: string,
  through?: string | null,
): Promise<{
  storedTurnContext: StoredRuntimeTurnContext;
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null;
}> {
  const storedContextCandidate = await raceAbort(
    dependencies.store.getLatestContextCheckpoint(sessionId, excludeCheckpointMessageId, through),
    signal,
  );
  const checkpointValidation = storedContextCandidate
    ? validateRuntimeContextCheckpointCandidate(storedContextCandidate.checkpoint)
    : null;
  const requestedCheckpoint = checkpointValidation?.checkpoint ?? null;
  const storedTurnContext = await raceAbort(
    dependencies.store.loadRuntimeTurnContext(
      sessionId,
      requestedCheckpoint?.anchorTurnId ?? null,
      through,
    ),
    signal,
  );
  const runtimeContextIssue =
    checkpointValidation?.issue ??
    (requestedCheckpoint && !storedTurnContext.anchorFound
      ? 'CONTEXT_CHECKPOINT_ANCHOR_INVALID'
      : null);
  if (runtimeContextIssue) {
    logger.warn('Agent context checkpoint rejected; replaying full history', {
      code: runtimeContextIssue,
      checkpointMessageId: storedContextCandidate?.assistantMessageId,
      sessionId,
    });
  }
  return {
    storedTurnContext,
    runtimeContextCheckpoint:
      requestedCheckpoint && storedTurnContext.anchorFound ? requestedCheckpoint : null,
  };
}

export async function prepareInitialTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentStartSessionInput,
  signal: AbortSignal,
  scope: Pick<TurnScope, 'readOnlyTools'> = {},
): Promise<TurnPlan> {
  const documentParserMode = dependencies.documentParserMode();
  const configuredAgent = await raceAbort(
    dependencies.agents.getAgent(parsed.agentId, parsed.modelId ?? parsed.sessionModelId),
    signal,
  );
  if (!configuredAgent) {
    fail('AGENT_NOT_FOUND', `Agent does not exist: ${parsed.agentId}`);
  }
  if (
    parsed.sessionModelId &&
    configuredAgent.allowedModelIds &&
    !configuredAgent.allowedModelIds.includes(parsed.sessionModelId)
  ) {
    fail(
      'CAPABILITY_UNSUPPORTED',
      `Model is not in the Agent's allowed pool: ${parsed.sessionModelId}`,
    );
  }
  const session = {
    agentId: parsed.agentId,
    model: parsed.sessionModelId,
    name: '',
    workspaceFolderId: parsed.workspaceFolderId ?? null,
  };
  const emptyContext: StoredRuntimeTurnContext = {
    anchorFound: true,
    hasMessages: false,
    history: [],
    referencedFileEntryIds: [],
  };

  return prepareResolvedTurn(
    dependencies,
    parsed,
    session,
    configuredAgent,
    emptyContext,
    null,
    documentParserMode,
    signal,
    { ...scope, through: null },
  );
}

/** Native conversations prepare capabilities and new input without reconstructing model history. */
export async function prepareDurableTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput,
  referencedFileEntryIds: readonly string[],
  signal: AbortSignal,
  scope: TurnScope = {},
  /** Recovery supplies the admitted identity; null must not inherit the current binding. */
  workspaceFolderId?: string | null,
  options?: {
    hasMessages?: boolean;
    recovering?: boolean;
    extraSkillActivations?: readonly SkillActivation[];
    retainedSkillIds?: readonly string[];
    retainedSkillRevisions?: ReadonlyMap<string, string>;
    loadSkillAvailable?: boolean;
    pinnedSkillScope?: SkillTurnScope;
    pinnedSkillRevisions?: ReadonlyMap<string, string>;
    skillScopeChanges?: readonly RuntimeSkillScopeChange[];
  },
): Promise<TurnPlan> {
  const session = await raceAbort(dependencies.store.getSession(parsed.sessionId), signal);
  if (!session) fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
  const agent = await raceAbort(
    dependencies.agents.getAgent(session.agentId, parsed.modelId ?? session.model),
    signal,
  );
  if (!agent) fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
  return prepareResolvedTurn(
    dependencies,
    parsed,
    workspaceFolderId === undefined ? session : { ...session, workspaceFolderId },
    agent,
    {
      anchorFound: true,
      hasMessages: options?.hasMessages ?? true,
      history: [],
      referencedFileEntryIds: [...referencedFileEntryIds],
    },
    null,
    dependencies.documentParserMode(),
    signal,
    {
      ...scope,
      ...(options?.recovering ? { recovering: true } : {}),
      ...(options?.extraSkillActivations?.length
        ? { extraSkillActivations: options.extraSkillActivations }
        : {}),
      ...(options?.retainedSkillIds !== undefined
        ? { retainedSkillIds: options.retainedSkillIds }
        : {}),
      ...(options?.retainedSkillRevisions !== undefined
        ? { retainedSkillRevisions: options.retainedSkillRevisions }
        : {}),
      ...(options?.loadSkillAvailable === false ? { loadSkillAvailable: false } : {}),
      ...(options?.pinnedSkillScope ? { pinnedSkillScope: options.pinnedSkillScope } : {}),
      ...(options?.pinnedSkillRevisions !== undefined
        ? { pinnedSkillRevisions: options.pinnedSkillRevisions }
        : {}),
      ...(options?.skillScopeChanges?.length
        ? { skillScopeChanges: options.skillScopeChanges }
        : {}),
    },
  );
}

export async function prepareResolvedTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput | AgentStartSessionInput,
  session: Pick<AgentSessionView, 'agentId' | 'model' | 'name' | 'workspaceFolderId'>,
  configuredAgent: AgentDefinition,
  storedTurnContext: StoredRuntimeTurnContext,
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null,
  documentParserMode: DocumentParserMode,
  signal: AbortSignal,
  scope: TurnScope = {},
): Promise<TurnPlan> {
  const { allowedModelIds } = configuredAgent;
  // Sync may have cleared the Session's override between reading it and the Agent row.
  const sessionModel =
    session.model && (allowedModelIds?.includes(session.model) ?? true) ? session.model : undefined;
  const overrideModelId = parsed.modelId ?? sessionModel;
  const resolvedModelId =
    overrideModelId ??
    createUniqueModelId(configuredAgent.model.providerId, configuredAgent.model.modelId);
  if (allowedModelIds && !allowedModelIds.includes(resolvedModelId)) {
    fail('CAPABILITY_UNSUPPORTED', `Model is not in the Agent's allowed pool: ${resolvedModelId}`);
  }
  const agent = applyTurnOverrides(configuredAgent, {
    modelId: overrideModelId,
    reasoningEffort:
      !parsed.reasoningEffortModelId || parsed.reasoningEffortModelId === resolvedModelId
        ? parsed.reasoningEffort
        : undefined,
  });
  if (
    scope.readOnlyTools &&
    (parsed.imageGeneration || parsed.skillIds?.length || parsed.skillAction)
  )
    fail(
      'CAPABILITY_UNSUPPORTED',
      'Multi-model replies support chat models without Skills or image generation.',
    );
  if (agent.mode === 'minimal' && (parsed.skillIds?.length || parsed.skillAction)) {
    fail('CAPABILITY_UNSUPPORTED', 'Minimal mode does not support Skills.');
  }
  if (agent.mode === 'minimal' && parsed.imageGeneration) {
    fail('CAPABILITY_UNSUPPORTED', 'Minimal mode does not support image generation.');
  }
  const usageAttribution = createTurnUsageAttribution({
    type: 'agent',
    id: agent.id,
    name: agent.name,
    icon: null,
  });
  const runtime = dependencies.runtime;
  if (
    !runtime.descriptor.capabilities.attachments &&
    parsed.parts.some((part) => part.type === 'file')
  ) {
    fail('CAPABILITY_UNSUPPORTED', 'File attachments are not supported for this Agent.');
  }
  const { availableFiles, inputFiles, parts } = await resolveManagedInput(
    dependencies.files,
    parsed.parts,
    storedTurnContext.history,
    signal,
  );
  if (agent.mode === 'minimal') {
    const document = [...inputFiles.values()].find((file) => !file.mediaType.startsWith('image/'));
    if (document) {
      throw new AgentProtocolError({
        code: 'CAPABILITY_UNSUPPORTED',
        message: 'Minimal mode accepts only text and images.',
        retryable: false,
        attachmentIssue: {
          code: 'runtime-unsupported',
          fileEntryId: document.fileEntryId,
          name: document.name,
        },
      });
    }
  }
  const resources = createTurnResourceLedger(
    inputFiles,
    storedTurnContext.referencedFileEntryIds,
    availableFiles,
  );

  const resolveInferenceModel = async () => {
    try {
      return await raceAbort(dependencies.inferenceModel(agent.model), signal);
    } catch {
      signal.throwIfAborted();
      fail('EXECUTION_UNAVAILABLE', 'The selected model is unavailable.');
    }
  };
  const imageGeneration = await dependencies.imageGeneration?.prepare({
    workspaceFolderId: session.workspaceFolderId ?? null,
    instructions: agent.instructions,
    model: agent.model,
    parts,
    resources,
    settings: parsed.imageGeneration,
    signal,
  });
  if (imageGeneration) {
    if (scope.readOnlyTools)
      fail('CAPABILITY_UNSUPPORTED', 'Multi-model replies do not support image generation.');
    if (agent.mode === 'minimal') {
      fail('CAPABILITY_UNSUPPORTED', 'Minimal mode requires a chat model.');
    }
    if (parsed.skillIds?.length || parsed.skillAction)
      fail('CAPABILITY_UNSUPPORTED', 'Skills cannot be used with image generation.');
    return {
      agent,
      ...(session.workspaceFolderId ? { workspaceFolderId: session.workspaceFolderId } : {}),
      documentParserMode,
      hasMessages: storedTurnContext.hasMessages,
      history: storedTurnContext.history,
      imageGeneration,
      inferenceSnapshot: createAgentInferenceSnapshot({
        model: await resolveInferenceModel(),
        options: {},
        tools: [],
        imageGeneration: imageGeneration.settings,
      }),
      inputParts: parts,
      modelPreflight: null,
      resources,
      runtimeContextCheckpoint: null,
      runtimeContentAttachments: new Map(),
      sessionTitle: session.name,
      tools: [],
      mcpNamespaces: [],
      pluginGuides: [],
      workflowInstructions: [],
      skills: EMPTY_TURN_SKILL_PLAN,
      toolDiscoveryWarnings: [],
      userParts: parts.map(
        (part, index): AgentMessagePart =>
          part.type === 'text'
            ? { ...part, id: `input-${index}`, state: 'done' }
            : {
                ...part,
                id: `input-${index}`,
                purpose: 'input-attachment',
                attachmentReport: {
                  mode: 'image',
                  sourceTruncated: false,
                  requestTruncated: false,
                },
              },
      ),
      usageAttribution,
    };
  }
  if (parsed.imageGeneration) {
    fail('CAPABILITY_UNSUPPORTED', 'Image generation is unavailable for this Agent.');
  }
  let modelPreflight: RuntimeModelPreflight;
  try {
    modelPreflight = await raceAbort(runtime.preflightModel(agent.model), signal);
  } catch {
    signal.throwIfAborted();
    fail(
      'CAPABILITY_UNSUPPORTED',
      'The selected model or provider endpoint cannot execute this turn.',
    );
  }
  // Desktop skips the whole function-tool catalog when the model cannot consume it.
  const canUseTools =
    agent.mode === 'standard' &&
    runtime.descriptor.capabilities.tools &&
    modelPreflight.supportsTools;
  if ((parsed.skillIds?.length || parsed.skillAction) && !canUseTools) {
    fail('CAPABILITY_UNSUPPORTED', 'Skills are not supported for this Agent.');
  }

  if (parsed.skillAction && (!dependencies.skillWorkflow || !dependencies.skills))
    fail('CAPABILITY_UNSUPPORTED', 'Skill management is unavailable in this environment.');

  // Freeze system capabilities, configured MCP tools, and connected plugins so
  // mid-turn changes cannot alter the active catalog. The catalog closes over
  // this turn's resource ledger, never a global file surface. System capability
  // resolution remains optional; configured MCP binding resolution fails closed.
  let systemTools: readonly RuntimeTool[] = [];
  let configuredTools: readonly RuntimeTool[] = [];
  let mcpCatalogVersion: number | undefined;
  let mcpNamespaces: readonly RuntimeMcpNamespace[] = [];
  let skillTools: readonly RuntimeTool[] = [];
  let pluginGuides: TurnPlan['pluginGuides'] = [];
  let skills: TurnSkillPlan = EMPTY_TURN_SKILL_PLAN;
  let systemCapabilitiesAll = false;
  let mcpCapabilitiesAll = false;
  const failedBuiltinCapabilityIds = new Set<string>();
  const failedMcpServerIds = new Set<string>();
  const failedMcpServerStates = new Map<string, FailedMcpServerState>();
  const toolDiscoveryWarnings: string[] = [];
  // A multi-model answer runs beside others, so it never loads Skills or plugin workflows.
  const canUseSkills = canUseTools && !scope.readOnlyTools;
  let receipts: ReturnType<typeof latestSkillActivations> = [];
  if (canUseTools) {
    // Read prior Skill receipts only when this turn can use tools and Skills.
    if (dependencies.skills && canUseSkills) {
      const priorReceipts = await raceAbort(
        dependencies.store.loadSkillActivations(parsed.sessionId, scope.through),
        signal,
      );
      const extraReceipts = (scope.extraSkillActivations ?? []).map((activation) => ({
        messageId: parsed.assistantMessageId,
        activation,
      }));
      const knownSkillIds = new Set([
        ...priorReceipts.map(({ activation }) => activation.skillId),
        ...extraReceipts.map(({ activation }) => activation.skillId),
      ]);
      const retainedReceipts = (scope.retainedSkillIds ?? []).flatMap((skillId) =>
        knownSkillIds.has(skillId)
          ? []
          : [
              {
                messageId: parsed.assistantMessageId,
                activation: { skillId, name: '', contentHash: '', origin: 'automatic' as const },
              },
            ],
      );
      receipts = latestSkillActivations([...priorReceipts, ...extraReceipts, ...retainedReceipts]);
    }
    try {
      systemTools = await raceAbort(
        dependencies.systemCapabilities.getTools({
          sessionId: parsed.sessionId,
          workspaceFolderId: session.workspaceFolderId ?? null,
          agentId: agent.id,
          askUser: dependencies.askUser,
          model: agent.model,
          acceptsImages: modelPreflight.inputModalities.includes('image'),
          resources,
          documentParserMode,
          resolveUsageAttribution: usageAttribution.resolve,
          onUnavailableCapability: (capabilityId) => {
            failedBuiltinCapabilityIds.add(capabilityId);
          },
        }),
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      systemCapabilitiesAll = true;
      logger.warn('Failed to resolve system capabilities; continuing without them', error as Error);
    }
    try {
      mcpCatalogVersion = dependencies.runtimeTools.catalogVersion?.();
      // The turn signal reaches live MCP discovery so cancelling the send
      // stops the network request rather than only abandoning its result.
      const configured = await raceAbort(
        dependencies.runtimeTools.resolve(
          agent.id,
          (warning) => {
            if (!signal.aborted) toolDiscoveryWarnings.push(warning);
          },
          signal,
          session.workspaceFolderId ?? null,
        ),
        signal,
      );
      configuredTools = configured.tools;
      mcpNamespaces = configured.mcpNamespaces ?? [];
      for (const serverId of configured.unavailableServerIds ?? []) {
        failedMcpServerIds.add(serverId);
      }
      for (const [serverId, state] of configured.unavailableServerStates ?? []) {
        failedMcpServerStates.set(serverId, {
          ...(state.executionSettingsKey !== undefined
            ? { executionSettingsKey: state.executionSettingsKey }
            : {}),
          ...(state.matchesExecutionSettingsKey
            ? { matchesExecutionSettingsKey: state.matchesExecutionSettingsKey }
            : {}),
          disabledTools: state.disabledTools,
          ...(state.resolveToolApproval
            ? {
                resolveEffectiveApproval: async (rawToolName) => {
                  const baseApproval = await state.resolveToolApproval!(rawToolName);
                  if (baseApproval === null || baseApproval === 'deny') return baseApproval;
                  return applyToolApprovalMode(baseApproval, agent.toolApprovalMode, true);
                },
              }
            : {}),
        });
      }
      if (canUseSkills) pluginGuides = configured.pluginGuides;
    } catch (error) {
      signal.throwIfAborted();
      if (!scope.recovering) {
        fail('EXECUTION_UNAVAILABLE', 'The configured Agent tools are unavailable.');
      }
      mcpCapabilitiesAll = true;
      failedBuiltinCapabilityIds.add(LOAD_WORKFLOW_TOOL_NAME);
      logger.warn(
        'Failed to resolve configured Agent tools during recovery; continuing without them',
        error as Error,
      );
    }
  }
  const authoritativeRetainedSkillIds =
    scope.recovering === true &&
    (scope.retainedSkillIds !== undefined || scope.retainedSkillRevisions !== undefined)
      ? new Set([
          ...(scope.retainedSkillIds ?? []),
          ...(scope.retainedSkillRevisions?.keys() ?? []),
        ])
      : undefined;
  if (canUseSkills) {
    let skillDiscoveryFailed = false;
    skills = await resolveTurnSkills(
      dependencies,
      agent,
      parsed.skillIds ?? [],
      receipts,
      signal,
      () => {
        skillDiscoveryFailed = true;
        for (const id of [
          LIST_LOCAL_SKILLS_TOOL_NAME,
          LOAD_SKILL_TOOL_NAME,
          LIST_SKILL_FILES_TOOL_NAME,
          READ_SKILL_FILE_TOOL_NAME,
          'adapt_skill',
        ]) {
          failedBuiltinCapabilityIds.add(id);
        }
      },
      scope.pinnedSkillScope,
      scope.skillScopeChanges,
      scope.pinnedSkillRevisions,
      scope.recovering === true,
      authoritativeRetainedSkillIds,
    );
    const baseScope = skills.scope;
    const expanding = createExpandingSkillScope(baseScope);
    skills = {
      ...skills,
      scope: expanding.scope,
      pinnedScope: baseScope,
      findAndInstall: parsed.skillAction === 'find-and-install',
      create: parsed.skillAction === 'create',
    };
    const hasLocalSkillTools =
      !skillDiscoveryFailed &&
      (skills.scope.entries.length > 0 ||
        skills.incompletePinnedScope === true ||
        Boolean(dependencies.skillWorkflow));
    if (hasLocalSkillTools) {
      const matchesRetainedRevision = (entry: SkillTurnEntry) => {
        if (authoritativeRetainedSkillIds && !authoritativeRetainedSkillIds.has(entry.id)) {
          return false;
        }
        const committed = scope.retainedSkillRevisions?.get(entry.id);
        return (
          committed === undefined ||
          committed === skillContentHashHex(entry.contentHash).slice(0, 12)
        );
      };
      const loaded = [...skills.selected, ...(skills.active?.values() ?? [])].filter(({ entry }) =>
        matchesRetainedRevision(entry),
      );
      const loadedSkills = new Set(loaded.map(({ entry }) => entry.id));
      skills = { ...skills, isLoaded: (skillId) => loadedSkills.has(skillId) };
      const unreadableSkillIds = new Set([
        ...(skills.unreadableSelectedSkillIds ?? []),
        ...(skills.unreadableActiveSkillIds ?? []),
      ]);
      skillTools = createSkillTools(skills.scope, {
        loadedSkillIds: loaded.map(({ entry }) => entry.id),
        loadedSkills,
        explicitSkillIds: [
          ...skills.selected.map(({ entry }) => entry.id),
          ...receipts
            .filter(
              (receipt) =>
                receipt.origin === 'explicit' && isSkillActivationCurrent(receipt, skills.scope),
            )
            .map((receipt) => receipt.skillId),
        ],
        instructionCharacters: loaded.reduce(
          (sum, { instructions }) => sum + [...instructions].length,
          0,
        ),
        instructionLengths: new Map(
          loaded.map(({ entry, instructions }) => [entry.id, [...instructions].length]),
        ),
        ...(unreadableSkillIds.size ? { unreadableSkillIds } : {}),
        ...(dependencies.skillWorkflow && dependencies.skills
          ? {
              adaptation: {
                workflow: dependencies.skillWorkflow,
                source: dependencies.skills,
                context: { agentId: agent.id },
                tools: [...systemTools, ...configuredTools],
                askUser: dependencies.askUser,
                language: dependencies.appLanguage?.() ?? 'en-US',
                replace: expanding.replace,
              },
            }
          : {}),
      });
    }
    if (dependencies.skillWorkflow && dependencies.skills) {
      const canLoadInstalledSkills = hasLocalSkillTools && scope.loadSkillAvailable !== false;
      skillTools = [
        ...skillTools,
        createSkillCreationTool(dependencies.skillWorkflow, { deferred: !skills.create }),
        ...createSkillManagementTools({
          workflow: dependencies.skillWorkflow,
          source: dependencies.skills,
          context: { agentId: agent.id },
          installIntent: skills.findAndInstall === true,
          ...(canLoadInstalledSkills ? { include: expanding.include } : {}),
        }),
      ];
    }
  }
  let tools = applyAgentToolApprovalMode(
    [...systemTools, ...configuredTools, ...skillTools],
    agent.toolApprovalMode,
  );
  // Parallel answers run side by side, so they only use tools declared read-only. Connected
  // reads keep the Agent's approval mode; a built-in read that still asks after it is a consent,
  // such as location or health data, and stays out.
  if (scope.readOnlyTools)
    tools = tools.filter(
      (tool) =>
        tool.effect === 'read' && (tool.ref.source !== 'builtin' || tool.approval === 'auto'),
    );
  let workflowInstructions: TurnPlan['workflowInstructions'] = [];
  if (pluginGuides.length > 0) {
    const workflows = getPluginWorkflows(pluginGuides);
    const availableWorkflowIds = new Set(workflows.map((workflow) => workflow.id));
    const unavailableWorkflowIds = new Set(
      [...failedMcpServerIds]
        .map((serverId) => `plugin:${serverId}`)
        .filter((workflowId) => !availableWorkflowIds.has(workflowId)),
    );
    tools = [
      ...requireLoadedWorkflows(tools, workflows),
      createLoadWorkflowTool(workflows, unavailableWorkflowIds),
    ];
    workflowInstructions = restoreLoadedWorkflows(
      workflows,
      await raceAbort(
        dependencies.store.loadWorkflowLoads(parsed.sessionId, scope.through),
        signal,
      ),
    );
  } else if (canUseSkills && failedMcpServerIds.size > 0) {
    failedBuiltinCapabilityIds.add(LOAD_WORKFLOW_TOOL_NAME);
  }
  const webTools = runtime.descriptor.capabilities.tools
    ? await raceAbort(Promise.resolve(dependencies.webTools?.()), signal)
    : undefined;
  const inferenceModel = await resolveInferenceModel();
  const inferenceSnapshot = createAgentInferenceSnapshot({
    model: inferenceModel,
    options: agent.options,
    tools,
  });

  assertAttachmentRequestSupported(
    runtime,
    parts,
    storedTurnContext.history,
    resources,
    modelPreflight,
  );
  const runtimeContentAttachments = await resolveRuntimeContentAttachments(
    dependencies.files,
    parts,
    storedTurnContext.history,
    resources,
    signal,
    modelPreflight,
    documentParserMode,
    agent.model,
  );

  const userParts: AgentMessagePart[] = parts.map((part, index) => {
    if (part.type === 'text') return { ...part, id: `input-${index}`, state: 'done' };
    const content = runtimeContentAttachments.get(part.fileEntryId);
    return {
      id: `input-${index}`,
      type: 'file',
      fileEntryId: part.fileEntryId,
      mediaType: part.mediaType,
      ...(part.filename !== undefined ? { filename: part.filename } : {}),
      purpose: 'input-attachment',
      attachmentReport:
        content?.type === 'text-attachment' || content?.type === 'document-attachment'
          ? content.attachmentReport
          : { mode: 'image', sourceTruncated: false, requestTruncated: false },
    };
  });

  if (skills.selected.length > 0 || parsed.skillAction) {
    const skillSelections: SkillActivation[] = skills.selected.map(({ entry }) => ({
      skillId: entry.id,
      name: entry.name,
      contentHash: entry.contentHash,
      origin: 'explicit',
    }));
    const textIndex = userParts.findIndex((part) => part.type === 'text');
    if (textIndex < 0)
      userParts.unshift({
        id: 'skill-selection',
        type: 'text',
        text: '',
        state: 'done',
        skillSelections,
        ...(parsed.skillAction ? { skillAction: parsed.skillAction } : {}),
      });
    else
      userParts[textIndex] = {
        ...(userParts[textIndex] as Extract<AgentMessagePart, { type: 'text' | 'reasoning' }>),
        skillSelections,
        ...(parsed.skillAction ? { skillAction: parsed.skillAction } : {}),
      };
  }

  return {
    agent,
    ...(session.workspaceFolderId ? { workspaceFolderId: session.workspaceFolderId } : {}),
    documentParserMode,
    hasMessages: storedTurnContext.hasMessages,
    history: storedTurnContext.history,
    inferenceSnapshot,
    inputParts: parts,
    modelPreflight,
    resources,
    runtimeContextCheckpoint,
    runtimeContentAttachments,
    sessionTitle: session.name,
    tools,
    ...(mcpCatalogVersion !== undefined ? { mcpCatalogVersion } : {}),
    mcpNamespaces,
    webTools,
    toolDiscoveryWarnings,
    userParts,
    pluginGuides,
    workflowInstructions,
    skills,
    toolDiscoveryFailures: {
      mcpCapabilitiesAll,
      mcpServerIds: failedMcpServerIds,
      ...(failedMcpServerStates.size > 0 ? { mcpServerStates: failedMcpServerStates } : {}),
      systemCapabilitiesAll,
      builtinCapabilityIds: failedBuiltinCapabilityIds,
    },
    usageAttribution,
  };
}

/**
 * Resolve the Skill scope and load explicit selections. A missing Skill
 * library is not a failure; an explicit selection outside the scope is, since
 * the user asked for something this Agent cannot use.
 */
async function resolveTurnSkills(
  dependencies: Pick<TurnPreparationDependencies, 'skills'>,
  agent: AgentDefinition,
  skillIds: readonly string[],
  activations: readonly SkillActivation[],
  signal: AbortSignal,
  onDiscoveryFailure?: () => void,
  pinnedScope?: SkillTurnScope,
  skillScopeChanges?: readonly RuntimeSkillScopeChange[],
  pinnedSkillRevisions?: ReadonlyMap<string, string>,
  recovering = false,
  authoritativeRetainedSkillIds?: ReadonlySet<string>,
): Promise<TurnSkillPlan> {
  if (!dependencies.skills && !pinnedScope) {
    if (skillIds.length > 0 && !recovering) {
      fail('CAPABILITY_UNSUPPORTED', 'Skills are not available in this environment.');
    }
    return EMPTY_TURN_SKILL_PLAN;
  }
  const unappliedChanges = pinnedScope
    ? coalesceSkillScopeChanges(pinnedScope, skillScopeChanges ?? [])
    : [];
  let scope: SkillTurnScope;
  let incompletePinnedScope = false;
  if (pinnedScope && unappliedChanges.length === 0) {
    scope = pinnedScope;
  } else if (!pinnedScope && pinnedSkillRevisions?.size === 0) {
    scope = EMPTY_SKILL_SCOPE;
  } else {
    let resolvedScope: SkillTurnScope;
    try {
      if (!dependencies.skills) {
        throw new Error('Skills source is unavailable.');
      }
      resolvedScope = await raceAbort(
        dependencies.skills.resolve({ agentId: agent.id, signal }),
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (skillIds.length > 0 && !recovering) {
        fail('EXECUTION_UNAVAILABLE', 'The selected Skills are unavailable.');
      }
      onDiscoveryFailure?.();
      logger.warn('Failed to resolve Agent Skills; continuing without them', error as Error);
      return EMPTY_TURN_SKILL_PLAN;
    }
    if (pinnedScope) {
      const expanding = createExpandingSkillScope(pinnedScope);
      for (const change of unappliedChanges) {
        if (change.kind === 'adapted') {
          expanding.replace(resolvedScope, change.skillId, change.contentHash);
        } else {
          expanding.include(resolvedScope, change.skillId, change.contentHash);
        }
      }
      scope = expanding.scope;
      for (const change of unappliedChanges) {
        if (
          !scope.entries.some(
            (entry) => entry.id === change.skillId && entry.contentHash === change.contentHash,
          )
        ) {
          incompletePinnedScope = true;
          break;
        }
      }
    } else if (pinnedSkillRevisions !== undefined) {
      scope = filterSkillScopeByRevisions(resolvedScope, pinnedSkillRevisions);
      if (scope.entries.length < pinnedSkillRevisions.size) {
        incompletePinnedScope = true;
      }
    } else {
      scope = resolvedScope;
    }
  }
  const selected: { entry: SkillTurnEntry; instructions: string }[] = [];
  const unreadableSelectedSkillIds = new Set<string>();
  let instructionCharacters = 0;
  for (const skillId of new Set(skillIds)) {
    const entry = scope.entries.find((candidate) => candidate.id === skillId);
    if (!entry || !entry.invocation.userInvocable) {
      if (pinnedSkillRevisions !== undefined || recovering) continue;
      fail('CAPABILITY_UNSUPPORTED', `The selected Skill is not usable by this Agent: ${skillId}`);
    }
    let instructions: string | null;
    try {
      instructions = await raceAbort(scope.readInstructions(entry.id), signal);
    } catch (error) {
      signal.throwIfAborted();
      if (!recovering) throw error;
      instructions = null;
    }
    if (instructions === null) {
      if (recovering) {
        unreadableSelectedSkillIds.add(skillId);
        logger.warn('Failed to read selected Skill package during recovery; isolating it', {
          skillId,
        });
        continue;
      }
      fail('EXECUTION_UNAVAILABLE', `The selected Skill package could not be read: ${skillId}`);
    }
    instructionCharacters += [...instructions].length;
    if (instructionCharacters > SKILL_ACTIVE_MAX_CHARACTERS)
      fail(
        'CAPABILITY_UNSUPPORTED',
        'The selected Skills exceed the instruction budget. Select fewer Skills.',
      );
    selected.push({ entry, instructions });
  }
  // Earlier activations stay active while their Skill remains usable; a
  // removed or disabled Skill simply stops contributing instructions.
  const active = new Map<string, { entry: SkillTurnEntry; instructions: string }>();
  const unreadableActiveSkillIds = new Set<string>();
  for (const activation of activations.toReversed()) {
    if (selected.length + active.size >= SKILL_ACTIVE_MAX_ENTRIES) break;
    if (authoritativeRetainedSkillIds && !authoritativeRetainedSkillIds.has(activation.skillId)) {
      continue;
    }
    if (
      !isSkillActivationCurrent(activation, scope) ||
      selected.some(({ entry }) => entry.id === activation.skillId)
    )
      continue;
    const entry = scope.entries.find((candidate) => candidate.id === activation.skillId)!;
    let instructions: string | null;
    try {
      instructions = await raceAbort(scope.readInstructions(entry.id), signal);
    } catch (error) {
      signal.throwIfAborted();
      if (!recovering) throw error;
      instructions = null;
    }
    if (instructions === null) {
      if (recovering) {
        unreadableActiveSkillIds.add(entry.id);
        logger.warn('Failed to read active Skill package during recovery; isolating it', {
          skillId: entry.id,
        });
      }
      continue;
    }
    const length = [...instructions].length;
    if (instructionCharacters + length > SKILL_ACTIVE_MAX_CHARACTERS) continue;
    instructionCharacters += length;
    active.set(entry.id, { entry, instructions });
  }
  return {
    scope,
    selected,
    active,
    ...(unreadableSelectedSkillIds.size ? { unreadableSelectedSkillIds } : {}),
    ...(unreadableActiveSkillIds.size ? { unreadableActiveSkillIds } : {}),
    ...(incompletePinnedScope ? { incompletePinnedScope: true } : {}),
  };
}

function coalesceSkillScopeChanges(
  pinnedScope: SkillTurnScope,
  changes: readonly RuntimeSkillScopeChange[],
): RuntimeSkillScopeChange[] {
  const pinnedById = new Map(pinnedScope.entries.map((entry) => [entry.id, entry.contentHash]));
  const targetById = new Map<string, RuntimeSkillScopeChange>();
  for (const change of changes) {
    const current = targetById.get(change.skillId);
    if (change.kind === 'installed') {
      if (!pinnedById.has(change.skillId) && !current) {
        targetById.set(change.skillId, { ...change });
      }
    } else if (current) {
      targetById.set(change.skillId, { ...current, contentHash: change.contentHash });
    } else if (pinnedById.has(change.skillId)) {
      targetById.set(change.skillId, { ...change });
    }
  }
  return [...targetById.values()].filter(
    (change) => pinnedById.get(change.skillId) !== change.contentHash,
  );
}

function applyTurnOverrides(
  agent: AgentDefinition,
  input: Pick<AgentSubmitMessageInput, 'modelId' | 'reasoningEffort'>,
): AgentDefinition {
  if (input.modelId === undefined && input.reasoningEffort === undefined) {
    return agent;
  }

  const options = { ...agent.options };
  if (input.reasoningEffort !== undefined) {
    options.reasoningEffort = input.reasoningEffort;
  }

  return {
    ...agent,
    ...(input.modelId ? { model: parseUniqueModelId(input.modelId) } : {}),
    options,
  };
}

/**
 * Applies only the Agent's interactive approval preference; the value-level
 * rule lives in the shared policy module next to the MCP approval floor.
 * Choosing auto means the user does not want the turn to stop for them, so it
 * also withholds the question tool: the model asks in its reply instead.
 */
function applyAgentToolApprovalMode(
  tools: readonly RuntimeTool[],
  mode: AgentDefinition['toolApprovalMode'],
): RuntimeTool[] {
  return tools.flatMap((tool) => {
    if (mode === 'auto' && isAskUserQuestionTool(tool)) return [];
    const approval = applyToolApprovalMode(tool.approval, mode, tool.autoApprovalEligible ?? true);
    return [approval === tool.approval ? tool : { ...tool, approval }];
  });
}

function isAskUserQuestionTool({ ref }: RuntimeTool): boolean {
  return ref.source === 'builtin' && ref.capabilityId === ASK_USER_QUESTION_TOOL_NAME;
}
