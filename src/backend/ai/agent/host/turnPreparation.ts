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
import { parseUniqueModelId } from '@/shared/data/types/model';
import { SKILL_ACTIVE_MAX_CHARACTERS, type SkillActivation } from '@/shared/data/types/skill';
import { applyToolApprovalMode } from '@/shared/utils/agentToolApproval';

import {
  createTurnResourceLedger,
  type ManagedFileResolver,
  type TurnResourceLedger,
} from '../resources/managedFileResolver';
import { raceAbort } from '../runtime';
import type {
  AgentRuntime,
  RuntimeContextCheckpoint,
  RuntimeModelPreflight,
  RuntimeTool,
} from '../runtime';
import type {
  AgentSessionStore,
  StoredRuntimeTurnContext,
} from '../sessionStore/AgentSessionStore';
import { ASK_USER_QUESTION_TOOL_NAME, type AskUserQuestion } from '../tools/askUserQuestionTool';
import type { SystemCapabilitySource } from '../tools/builtInToolSource';
import type { AgentRuntimeToolResolver } from '../tools/runtimeTools';
import { createSkillTools, createSkillManagementTools } from '../tools/skill';
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
  documentParserMode(): DocumentParserMode;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  imageGeneration?: AgentImageGenerationPort;
  /** The Host keeps the engine binding; preparation consumes that local Runtime. */
  runtime: AgentRuntime;
  runtimeTools: AgentRuntimeToolResolver;
  /** Optional so tests and hosts without a Skill library prepare turns unchanged. */
  skills?: SkillScopeSource;
  skillWorkflow?: SkillsModule;
  store: Pick<
    AgentSessionStore,
    'getLatestContextCheckpoint' | 'getSession' | 'loadRuntimeTurnContext' | 'loadSkillActivations'
  >;
  systemCapabilities: SystemCapabilitySource;
};

/** Everything the Host needs to reserve and execute a turn, frozen before the first write. */
export type TurnPlan = {
  agent: AgentDefinition;
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
  pluginGuides: readonly PluginGuideSnapshot[];
  /** The Skills usable in this turn, with their pinned revisions. */
  skills: TurnSkillPlan;
  toolDiscoveryWarnings: readonly string[];
  /** The user message parts to reserve, projected from the canonical input. */
  userParts: AgentMessagePart[];
  /** Source captured at admission; the Host binds the reserved message before execution. */
  usageAttribution: TurnUsageAttribution;
};

export type TurnSkillPlan = {
  scope: SkillTurnScope;
  findAndInstall?: boolean;
  /** Explicitly selected Skills with their instructions already loaded. */
  selected: readonly { entry: SkillTurnEntry; instructions: string }[];
  /** Instructions restored from earlier turns' receipts; they ride with the system prompt. */
  active?: ReadonlyMap<string, { entry: SkillTurnEntry; instructions: string }>;
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

export async function prepareTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput,
  signal: AbortSignal,
  excludeCheckpointMessageId?: string,
): Promise<TurnPlan> {
  const documentParserMode = dependencies.documentParserMode();
  const { sessionId } = parsed;
  const session = await raceAbort(dependencies.store.getSession(sessionId), signal);
  if (!session) {
    fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
  }
  const configuredAgent = await raceAbort(dependencies.agents.getAgent(session.agentId), signal);
  if (!configuredAgent) {
    fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
  }

  const { storedTurnContext, runtimeContextCheckpoint } = await loadTurnContext(
    dependencies,
    sessionId,
    signal,
    excludeCheckpointMessageId,
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
): Promise<{
  storedTurnContext: StoredRuntimeTurnContext;
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null;
}> {
  const storedContextCandidate = await raceAbort(
    dependencies.store.getLatestContextCheckpoint(sessionId, excludeCheckpointMessageId),
    signal,
  );
  const checkpointValidation = storedContextCandidate
    ? validateRuntimeContextCheckpointCandidate(storedContextCandidate.checkpoint)
    : null;
  const requestedCheckpoint = checkpointValidation?.checkpoint ?? null;
  const storedTurnContext = await raceAbort(
    dependencies.store.loadRuntimeTurnContext(sessionId, requestedCheckpoint?.anchorTurnId ?? null),
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
): Promise<TurnPlan> {
  const documentParserMode = dependencies.documentParserMode();
  const configuredAgent = await raceAbort(dependencies.agents.getAgent(parsed.agentId), signal);
  if (!configuredAgent) {
    fail('AGENT_NOT_FOUND', `Agent does not exist: ${parsed.agentId}`);
  }
  const session = {
    agentId: parsed.agentId,
    name: '',
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
  );
}

/** Native conversations prepare capabilities and new input without reconstructing model history. */
export async function prepareDurableTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput,
  referencedFileEntryIds: readonly string[],
  signal: AbortSignal,
): Promise<TurnPlan> {
  const session = await raceAbort(dependencies.store.getSession(parsed.sessionId), signal);
  if (!session) fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
  const agent = await raceAbort(dependencies.agents.getAgent(session.agentId), signal);
  if (!agent) fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
  return prepareResolvedTurn(
    dependencies,
    parsed,
    session,
    agent,
    {
      anchorFound: true,
      hasMessages: true,
      history: [],
      referencedFileEntryIds: [...referencedFileEntryIds],
    },
    null,
    dependencies.documentParserMode(),
    signal,
  );
}

export async function prepareResolvedTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput | AgentStartSessionInput,
  session: Pick<AgentSessionView, 'agentId' | 'name'>,
  configuredAgent: AgentDefinition,
  storedTurnContext: StoredRuntimeTurnContext,
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null,
  documentParserMode: DocumentParserMode,
  signal: AbortSignal,
): Promise<TurnPlan> {
  const agent = applyTurnOverrides(configuredAgent, parsed);
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
    instructions: agent.instructions,
    model: agent.model,
    parts,
    resources,
    settings: parsed.imageGeneration,
    signal,
  });
  if (imageGeneration) {
    if (parsed.skillIds?.length || parsed.skillAction)
      fail('CAPABILITY_UNSUPPORTED', 'Skills cannot be used with image generation.');
    return {
      agent,
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
      pluginGuides: [],
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
  if ((parsed.skillIds?.length || parsed.skillAction) && !runtime.descriptor.capabilities.tools) {
    fail('CAPABILITY_UNSUPPORTED', 'Skills are not supported for this Agent.');
  }

  if (parsed.skillAction && (!dependencies.skillWorkflow || !dependencies.skills))
    fail('CAPABILITY_UNSUPPORTED', 'Skill discovery is unavailable in this environment.');

  // Freeze system capabilities, configured MCP tools, and connected plugins so
  // mid-turn changes cannot alter the active catalog. The catalog closes over
  // this turn's resource ledger, never a global file surface. System capability
  // resolution remains optional; configured MCP binding resolution fails closed.
  let systemTools: readonly RuntimeTool[] = [];
  let configuredTools: readonly RuntimeTool[] = [];
  let skillTools: readonly RuntimeTool[] = [];
  let pluginGuides: TurnPlan['pluginGuides'] = [];
  let skills: TurnSkillPlan = EMPTY_TURN_SKILL_PLAN;
  const toolDiscoveryWarnings: string[] = [];
  // Receipts come from the Cherry transcript, so they also cover turns Pi has compacted.
  const receipts = dependencies.skills
    ? latestSkillActivations(
        await raceAbort(dependencies.store.loadSkillActivations(parsed.sessionId), signal),
      )
    : [];
  if (runtime.descriptor.capabilities.tools) {
    try {
      systemTools = await raceAbort(
        dependencies.systemCapabilities.getTools({
          agentId: agent.id,
          askUser: dependencies.askUser,
          disabledCapabilities: agent.disabledCapabilities,
          model: agent.model,
          resources,
          documentParserMode,
          resolveUsageAttribution: usageAttribution.resolve,
        }),
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('Failed to resolve system capabilities; continuing without them', error as Error);
    }
    try {
      // The turn signal reaches live MCP discovery so cancelling the send
      // stops the network request rather than only abandoning its result.
      const configured = await raceAbort(
        dependencies.runtimeTools.resolve(
          agent.id,
          (warning) => {
            if (!signal.aborted) toolDiscoveryWarnings.push(warning);
          },
          signal,
        ),
        signal,
      );
      configuredTools = configured.tools;
      pluginGuides = configured.pluginGuides;
    } catch {
      signal.throwIfAborted();
      fail('EXECUTION_UNAVAILABLE', 'The configured Agent tools are unavailable.');
    }
    skills = await resolveTurnSkills(
      dependencies,
      agent,
      parsed.skillIds ?? [],
      [...systemTools, ...configuredTools],
      receipts,
      signal,
    );
    const expanding = createExpandingSkillScope(skills.scope);
    skills = {
      ...skills,
      scope: expanding.scope,
      findAndInstall: parsed.skillAction === 'find-and-install',
    };
    if (skills.scope.entries.length > 0 || dependencies.skillWorkflow) {
      const loaded = [...skills.selected, ...(skills.active?.values() ?? [])];
      skillTools = createSkillTools(skills.scope, {
        loadedSkillIds: loaded.map(({ entry }) => entry.id),
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
      });
    }
    if (dependencies.skillWorkflow && dependencies.skills) {
      skillTools = [
        ...skillTools,
        ...createSkillManagementTools({
          workflow: dependencies.skillWorkflow,
          source: dependencies.skills,
          context: {
            agentId: agent.id,
            disabledCapabilities: agent.disabledCapabilities,
            model: agent.model,
            tools: [...systemTools, ...configuredTools],
          },
          installIntent: skills.findAndInstall === true,
          include: expanding.include,
        }),
      ];
    }
  }
  const tools = applyAgentToolApprovalMode(
    [...systemTools, ...configuredTools, ...skillTools],
    agent.toolApprovalMode,
  );
  const inferenceModel = await resolveInferenceModel();
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
  if (tools.length > 0 && !modelPreflight.supportsTools) {
    fail('TOOL_CALLING_UNSUPPORTED', 'The selected model does not support native tool calling.');
  }
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
    toolDiscoveryWarnings,
    userParts,
    pluginGuides,
    skills,
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
  tools: readonly RuntimeTool[],
  activations: readonly SkillActivation[],
  signal: AbortSignal,
): Promise<TurnSkillPlan> {
  if (!dependencies.skills) {
    if (skillIds.length > 0) {
      fail('CAPABILITY_UNSUPPORTED', 'Skills are not available in this environment.');
    }
    return EMPTY_TURN_SKILL_PLAN;
  }
  let scope: SkillTurnScope;
  try {
    scope = await raceAbort(
      dependencies.skills.resolve({
        agentId: agent.id,
        disabledCapabilities: agent.disabledCapabilities,
        model: agent.model,
        tools,
        signal,
      }),
      signal,
    );
  } catch (error) {
    signal.throwIfAborted();
    if (skillIds.length > 0) {
      fail('EXECUTION_UNAVAILABLE', 'The selected Skills are unavailable.');
    }
    logger.warn('Failed to resolve Agent Skills; continuing without them', error as Error);
    return EMPTY_TURN_SKILL_PLAN;
  }
  const selected: { entry: SkillTurnEntry; instructions: string }[] = [];
  let instructionCharacters = 0;
  for (const skillId of new Set(skillIds)) {
    const entry = scope.entries.find((candidate) => candidate.id === skillId);
    if (!entry || !entry.invocation.userInvocable) {
      fail('CAPABILITY_UNSUPPORTED', `The selected Skill is not usable by this Agent: ${skillId}`);
    }
    const instructions = await raceAbort(scope.readInstructions(entry.id), signal);
    if (instructions === null) {
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
  for (const activation of activations.toReversed()) {
    if (
      !isSkillActivationCurrent(activation, scope) ||
      selected.some(({ entry }) => entry.id === activation.skillId)
    )
      continue;
    const entry = scope.entries.find((candidate) => candidate.id === activation.skillId)!;
    const instructions = await raceAbort(scope.readInstructions(entry.id), signal);
    if (instructions === null) continue;
    const length = [...instructions].length;
    if (instructionCharacters + length > SKILL_ACTIVE_MAX_CHARACTERS) continue;
    instructionCharacters += length;
    active.set(entry.id, { entry, instructions });
  }
  return { scope, selected, active };
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
