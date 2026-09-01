/**
 * Turn preparation for the Mobile Agent Host: everything between admission
 * and the first durable write. `prepareTurn` is a standalone planning stage
 * over explicit ports — it loads the Session, Agent definition, checkpoint,
 * and history, admits attachments, freezes the tool snapshot, preflights the
 * model, and returns one immutable `TurnPlan`. It performs no writes and
 * publishes no events, so every gate can fail here with zero side effects
 * and the stage is testable without a Host instance.
 */

import {
  AgentProtocolError,
  type AgentErrorView,
  type AgentExecutionTarget,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentSessionView,
  type AgentStartSessionInput,
  type AgentSubmitMessageInput,
} from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { parseUniqueModelId } from '@/shared/data/types/model';
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
import type { SystemCapabilitySource } from '../tools/builtInToolSource';
import type { AgentRuntimeToolResolver } from '../tools/runtimeTools';
import type { AgentDefinition, AgentDefinitionSource } from './agentDefinitions';
import { validateRuntimeContextCheckpointCandidate } from './contextCheckpoints';
import {
  createAgentInferenceSnapshot,
  type AgentInferenceModelResolver,
} from './inferenceSnapshot';
import {
  assertAttachmentRequestSupported,
  resolveManagedInput,
  resolveRuntimeTextAttachments,
} from './turnAttachments';
import type { RuntimeAttachmentContents } from './turnRuntimeInput';

const logger = loggerService.withContext('AgentTurnPreparation');

function fail(code: AgentErrorView['code'], message: string, retryable = false): never {
  throw new AgentProtocolError({ code, message, retryable });
}

export type TurnPreparationDependencies = {
  agents: AgentDefinitionSource;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  /** The Host keeps the engine binding; preparation only consumes the routed Runtime. */
  routeExecutionTarget(target: AgentExecutionTarget): AgentRuntime;
  runtimeTools: AgentRuntimeToolResolver;
  store: Pick<
    AgentSessionStore,
    'getLatestContextCheckpoint' | 'getSession' | 'loadRuntimeTurnContext'
  >;
  systemCapabilities: SystemCapabilitySource;
};

/** Everything the Host needs to reserve and execute a turn, frozen before the first write. */
export type TurnPlan = {
  agent: AgentDefinition;
  /** False only for a truly empty Session; drives first-message auto-naming. */
  hasMessages: boolean;
  history: AgentMessageView[];
  inferenceSnapshot: ReturnType<typeof createAgentInferenceSnapshot>;
  /** Canonicalized input parts: file parts rewritten to verified managed facts. */
  inputParts: AgentInputPart[];
  modelPreflight: RuntimeModelPreflight;
  resources: TurnResourceLedger;
  runtime: AgentRuntime;
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null;
  runtimeTextAttachments: RuntimeAttachmentContents;
  sessionTitle: string;
  sessionTurnIds: readonly string[];
  tools: readonly RuntimeTool[];
  /** The user message parts to reserve, projected from the canonical input. */
  userParts: AgentMessagePart[];
};

export async function prepareTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput,
  signal: AbortSignal,
): Promise<TurnPlan> {
  const { sessionId } = parsed;
  const session = await raceAbort(dependencies.store.getSession(sessionId), signal);
  if (!session) {
    fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
  }
  const configuredAgent = await raceAbort(dependencies.agents.getAgent(session.agentId), signal);
  if (!configuredAgent) {
    fail('AGENT_NOT_FOUND', `Agent does not exist: ${session.agentId}`);
  }

  const storedContextCandidate = await raceAbort(
    dependencies.store.getLatestContextCheckpoint(sessionId),
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
  const runtimeContextCheckpoint =
    requestedCheckpoint && storedTurnContext.anchorFound ? requestedCheckpoint : null;
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

  return prepareResolvedTurn(
    dependencies,
    parsed,
    session,
    configuredAgent,
    storedTurnContext,
    runtimeContextCheckpoint,
    signal,
  );
}

export async function prepareInitialTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentStartSessionInput,
  signal: AbortSignal,
): Promise<TurnPlan> {
  const configuredAgent = await raceAbort(dependencies.agents.getAgent(parsed.agentId), signal);
  if (!configuredAgent) {
    fail('AGENT_NOT_FOUND', `Agent does not exist: ${parsed.agentId}`);
  }
  const session = {
    agentId: parsed.agentId,
    executionTarget: parsed.executionTarget,
    title: '',
  };
  const emptyContext: StoredRuntimeTurnContext = {
    anchorFound: true,
    hasMessages: false,
    history: [],
    referencedFileEntryIds: [],
    sessionTurnIds: [],
  };

  return prepareResolvedTurn(
    dependencies,
    parsed,
    session,
    configuredAgent,
    emptyContext,
    null,
    signal,
  );
}

async function prepareResolvedTurn(
  dependencies: TurnPreparationDependencies,
  parsed: AgentSubmitMessageInput | AgentStartSessionInput,
  session: Pick<AgentSessionView, 'agentId' | 'executionTarget' | 'title'>,
  configuredAgent: AgentDefinition,
  storedTurnContext: StoredRuntimeTurnContext,
  runtimeContextCheckpoint: RuntimeContextCheckpoint | null,
  signal: AbortSignal,
): Promise<TurnPlan> {
  const agent = applyTurnOverrides(configuredAgent, parsed);
  const runtime = dependencies.routeExecutionTarget(session.executionTarget);
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

  // Freeze system capabilities and configured MCP tools for the turn so
  // mid-turn changes cannot alter the active catalog. The catalog closes over
  // this turn's resource ledger, never a global file surface. System capability
  // resolution remains optional; configured MCP binding resolution fails closed.
  let systemTools: readonly RuntimeTool[] = [];
  let configuredTools: readonly RuntimeTool[] = [];
  if (runtime.descriptor.capabilities.tools) {
    try {
      systemTools = await raceAbort(
        dependencies.systemCapabilities.getTools({
          disabledCapabilities: agent.disabledCapabilities,
          model: agent.model,
          resources,
        }),
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('Failed to resolve system capabilities; continuing without them', error as Error);
    }
    try {
      configuredTools = await raceAbort(dependencies.runtimeTools.resolve(agent.id), signal);
    } catch {
      signal.throwIfAborted();
      fail('EXECUTION_UNAVAILABLE', 'The configured Agent tools are unavailable.');
    }
  }
  const tools = applyAgentToolApprovalMode(
    [...systemTools, ...configuredTools],
    agent.toolApprovalMode,
  );
  let inferenceModel: Awaited<ReturnType<AgentInferenceModelResolver>>;
  try {
    inferenceModel = await raceAbort(dependencies.inferenceModel(agent.model), signal);
  } catch {
    signal.throwIfAborted();
    fail('EXECUTION_UNAVAILABLE', 'The selected model is unavailable.');
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
  if (tools.length > 0 && !modelPreflight.supportsTools) {
    fail('CAPABILITY_UNSUPPORTED', 'The selected model does not support native tool calling.');
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
  const runtimeTextAttachments = await resolveRuntimeTextAttachments(
    dependencies.files,
    parts,
    storedTurnContext.history,
    resources,
    signal,
  );

  const userParts: AgentMessagePart[] = parts.map((part, index) =>
    part.type === 'text'
      ? { id: `input-${index}`, type: 'text', text: part.text, state: 'done' }
      : {
          id: `input-${index}`,
          type: 'file',
          fileEntryId: part.fileEntryId,
          mediaType: part.mediaType,
          ...(part.name !== undefined ? { name: part.name } : {}),
          purpose: 'input-attachment',
        },
  );

  return {
    agent,
    hasMessages: storedTurnContext.hasMessages,
    history: storedTurnContext.history,
    inferenceSnapshot,
    inputParts: parts,
    modelPreflight,
    resources,
    runtime,
    runtimeContextCheckpoint,
    runtimeTextAttachments,
    sessionTitle: session.title,
    sessionTurnIds: storedTurnContext.sessionTurnIds,
    tools,
    userParts,
  };
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
    if (input.reasoningEffort === 'default' || input.reasoningEffort === 'auto') {
      // Pi resolves an absent effort to the selected model's default. Removing
      // the Agent setting here makes an explicit composer "default" win.
      delete options.reasoningEffort;
    } else {
      options.reasoningEffort = input.reasoningEffort === 'none' ? 'off' : input.reasoningEffort;
    }
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
 */
function applyAgentToolApprovalMode(
  tools: readonly RuntimeTool[],
  mode: AgentDefinition['toolApprovalMode'],
): RuntimeTool[] {
  return tools.map((tool) => {
    const approval = applyToolApprovalMode(tool.approval, mode, tool.autoApprovalEligible ?? true);
    return approval === tool.approval ? tool : { ...tool, approval };
  });
}
