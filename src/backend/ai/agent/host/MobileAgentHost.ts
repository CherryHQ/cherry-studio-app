/**
 * Mobile Agent Host: the only adapter between the Agent Protocol
 * (`@/shared/contracts/agent`) and the Agent Runtime contract
 * (`../runtime`), per docs/references/agent/.
 *
 * The Host owns Agent lookup, Session persistence, the local Runtime binding, the
 * streaming overlay, snapshots, and lifecycle recovery. It is an app-owned
 * lifecycle service (one per ApplicationHost generation):
 * route unmount only unsubscribes; disposal cancels and awaits active turns.
 *
 * Protocol invariants implemented here (agent-protocol.md):
 * 1.  one active turn per Session (synchronous admission guard);
 * 2.  reservation of user message + assistant placeholder commits atomically
 *     before execution;
 * 3/4. the Runtime contract guarantees exactly one terminal event and silence
 *     after it; the run loop stops at the first terminal;
 * 5.  terminal message state commits before terminal events publish; the
 *     terminal turn is a projection of that committed message;
 * 6.  cancellation settles as `cancelled` (or `interrupted` at startup);
 * 7.  approval responses correlate to the active Session/turn/approval and
 *     fail closed;
 * 8.  `observeSession` captures snapshot and subscription in one synchronous
 *     section, so no event falls into a gap;
 * 9.  operation inputs are schema-parsed, snapshots re-validate, and every
 *     published event is JSON-cloned (a non-JSON-safe value cannot survive);
 * 10. clients supply an execution target and Agent id; the local Pi binding
 *     stays private to the Host.
 */

import { unsupportedMediaNote } from '@cherrystudio/ai-runtime/messages';

import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { agentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import {
  AgentCancelTurnInputSchema,
  AgentCreateSessionInputSchema,
  AgentDeleteSessionInputSchema,
  AgentRenameSessionInputSchema,
  AgentRespondApprovalInputSchema,
  AgentSubmitMessageInputSchema,
  AgentSessionSnapshotSchema,
  AgentProtocolError,
  type AgentApprovalView,
  type AgentCapabilities,
  type AgentErrorView,
  type AgentEvent,
  type AgentExecutionTarget,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentProtocol,
  type AgentSessionObservation,
  type AgentSessionView,
  type AgentSubmitMessageInput,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { parseUniqueModelId } from '@/shared/data/types/model';
import { applyToolApprovalMode } from '@/shared/utils/agentToolApproval';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import { createPiModelResolver } from '../piAdapter/piModelResolver';
import { findImageAttachmentLimit, type ImageAttachmentLimit } from '../resources/imageAttachments';
import {
  createTurnResourceLedger,
  managedFileResolver,
  type ManagedFileFact,
  type ManagedFileResolver,
  type TurnResourceLedger,
} from '../resources/managedFileResolver';
import {
  isSupportedTextAttachment,
  resolveManagedTextAttachments,
  TextAttachmentError,
} from '../resources/textAttachments';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeContextCheckpoint,
  RuntimeEvent,
  RuntimeInputPart,
  RuntimeModelPreflight,
  RuntimeTool,
  RuntimeUsageReport,
} from '../runtime';
import { PiRuntime, raceAbort } from '../runtime';
import type { AgentSessionStore } from '../sessionStore/AgentSessionStore';
import { interruptNonTerminalToolParts } from '../sessionStore/messageSettlement';
import {
  createSystemCapabilitySource,
  type SystemCapabilitySource,
} from '../tools/builtInToolSource';
import {
  createAgentRuntimeToolResolver,
  type AgentRuntimeToolResolver,
} from '../tools/runtimeTools';
import {
  createAgentTableDefinitionSource,
  type AgentDefinition,
  type AgentDefinitionSource,
} from './agentDefinitions';
import { AgentSessionNaming } from './AgentSessionNaming';
import { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import {
  validateRuntimeContextCheckpoint,
  validateRuntimeContextCheckpointCandidate,
} from './contextCheckpoints';
import {
  createAgentInferenceSnapshot,
  type AgentInferenceModelResolver,
  resolveAgentInferenceModel,
} from './inferenceSnapshot';
import {
  toAgentApprovalView,
  toAgentErrorView,
  toAgentMessagePart,
  toAgentUsageView,
  toRuntimeHistory,
  toRuntimeInputParts,
  type RuntimeAttachmentContents,
} from './mapping';

const logger = loggerService.withContext('MobileAgentHost');

const INTERRUPTED_ERROR: AgentErrorView = {
  code: 'INTERRUPTED',
  message: 'The app restarted before this turn finished.',
  retryable: true,
};

const NOOP_BACKGROUND_REPLY_TURN: BackgroundReplyTurn = {
  awaitApproval: () => {},
  finish: () => {},
  update: () => {},
};

const TERMINAL_PERSISTENCE_RETRY_DELAYS_MS = [0, 50, 200] as const;
const NO_IMAGE_MEDIA_CAPABILITIES = { image: false, video: true, audio: true } as const;

type MobileAgentHostOverrides = {
  agents: AgentDefinitionSource;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  naming: Pick<
    AgentSessionNaming,
    'drain' | 'maybeRenameFromConversationSummary' | 'maybeRenameFromFirstUserMessage'
  >;
  runtimeTools: AgentRuntimeToolResolver;
  usage: Pick<AgentSessionUsageRecorder, 'drain' | 'record'>;
  tools: SystemCapabilitySource;
};

/**
 * The Host owns the Turn projection (agent-persistence.md): the store persists
 * messages only, live turn state exists here, and the terminal turn view is
 * derived from the settled assistant message.
 */
type ActiveTurnState = {
  agent: AgentDefinition;
  abortController: AbortController;
  turn: AgentTurnView;
  assistantMessage: AgentMessageView;
  autoNamePromise: Promise<AgentSessionView | null> | null;
  autoNameUserParts: AgentInputPart[] | null;
  backgroundReply: BackgroundReplyTurn;
  pendingApprovals: Map<string, AgentApprovalView>;
  pendingContextCheckpoint: RuntimeContextCheckpoint | null;
  resources: TurnResourceLedger;
  sessionTurnIds: Set<string>;
  usage: RuntimeUsageReport | null;
  runtimeSession: AgentRuntimeSession;
};

type AdmissionState = {
  abortController: AbortController;
  completion: Promise<void>;
};

class TerminalPersistenceError extends Error {
  override readonly name = 'TerminalPersistenceError';

  constructor(readonly failure: unknown) {
    super('The Agent Host could not persist a terminal turn state.');
  }
}

function fail(code: AgentErrorView['code'], message: string, retryable = false): never {
  throw new AgentProtocolError({ code, message, retryable });
}

/** Boundary clone: enforces JSON-safety and detaches listeners from live state. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCompletionSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

@Injectable('MobileAgentHost')
@ServicePhase(Phase.PostReady)
// Tool Runtime owners stop after this Host has drained its frozen turn
// catalogs. Constructor injection keeps runtime ownership and lifecycle
// ordering on the same declared edges. Covered by a stop-order test.
@DependsOn([
  'AgentSessionStore',
  'AiService',
  'PreferenceService',
  'BackgroundReplyRuntime',
  'McpRuntimeService',
  'WebSearchService',
])
@AppStatePolicy('continue')
export class MobileAgentHost extends BaseService implements AgentProtocol {
  private readonly listeners = new Map<string, Set<(event: AgentEvent) => void>>();
  private readonly activeTurns = new Map<string, ActiveTurnState>();
  private readonly admittingSessions = new Map<string, AdmissionState>();
  private readonly deletingSessions = new Set<string>();
  private readonly runningTurnsBySession = new Map<string, Promise<void>>();
  private readonly runtimeSessions = new Map<
    string,
    { runtimeId: string; session: AgentRuntimeSession }
  >();
  private readonly runningTurns = new Set<Promise<void>>();
  private readonly files: ManagedFileResolver;
  private readonly naming: MobileAgentHostOverrides['naming'];
  private readonly usage: MobileAgentHostOverrides['usage'];
  private readonly inferenceModel: MobileAgentHostOverrides['inferenceModel'];
  private readonly runtimeTools: MobileAgentHostOverrides['runtimeTools'];
  private readonly lifecycleAbortController = new AbortController();
  private acceptingSubmissions = true;

  /**
   * Lifecycle composition supplies the selected store adapter. Production
   * binds `local` directly to Pi; tests may replace the Runtime and Agent ports.
   */
  constructor(
    private readonly store: AgentSessionStore,
    aiService: AiService,
    preferenceService: PreferenceService,
    private readonly backgroundReply: BackgroundReplyLifecycle,
    mcpRuntime: McpRuntimeService,
    private readonly webSearchService: WebSearchService,
    private readonly runtime: AgentRuntime = new PiRuntime(createPiModelResolver()),
    private readonly overrides: Partial<MobileAgentHostOverrides> = {},
  ) {
    super();
    this.files = overrides.files ?? managedFileResolver;
    this.naming =
      overrides.naming ??
      new AgentSessionNaming({
        ai: aiService,
        model: modelService,
        preference: preferenceService,
        provider: providerService,
        signal: this.lifecycleAbortController.signal,
        store,
      });
    this.usage = overrides.usage ?? new AgentSessionUsageRecorder();
    this.inferenceModel = overrides.inferenceModel ?? resolveAgentInferenceModel;
    this.runtimeTools =
      overrides.runtimeTools ??
      createAgentRuntimeToolResolver({
        bindings: agentToolBindingService,
        getMcpRuntime: () => mcpRuntime,
      });
  }

  private get agents(): AgentDefinitionSource {
    return this.overrides.agents ?? (this.lazyAgents ??= createAgentTableDefinitionSource());
  }

  private lazyAgents: AgentDefinitionSource | undefined;

  private get systemCapabilities(): SystemCapabilitySource {
    return (
      this.overrides.tools ??
      (this.lazySystemCapabilities ??= createSystemCapabilitySource({
        webSearch: this.webSearchService,
      }))
    );
  }

  private lazySystemCapabilities: SystemCapabilitySource | undefined;

  /** Reconcile any unfinished state available from the selected store. */
  protected override async onInit(): Promise<void> {
    await this.reconcileInterruptedTurns();
  }

  /**
   * Stop owns the work: abort every turn synchronously first, then close the
   * Runtime sessions (each close is internally bounded) and join what remains.
   * Destroy only releases references, so a stop that ran out of budget cannot
   * leave live work behind a torn-down listener surface.
   */
  protected override async onStop(): Promise<void> {
    this.acceptingSubmissions = false;
    const reason = new Error('The Agent Host is stopping.');
    this.lifecycleAbortController.abort(reason);
    for (const state of this.activeTurns.values()) {
      state.abortController.abort(reason);
    }
    for (const admission of this.admittingSessions.values()) {
      admission.abortController.abort(reason);
    }
    await Promise.allSettled(
      [...this.admittingSessions.values()].map(({ completion }) => completion),
    );
    // An admission already committing its reservation may have installed a
    // turn while the first abort pass was running.
    for (const state of this.activeTurns.values()) {
      state.abortController.abort(reason);
    }
    const closing = [...this.runtimeSessions.values()].map(({ session }) =>
      session
        .close()
        .catch((error) =>
          logger.warn('Failed to close a runtime session during stop', error as Error),
        ),
    );
    this.runtimeSessions.clear();
    await Promise.allSettled(closing);
    await Promise.allSettled(this.runningTurns);
    await this.naming.drain();
    await this.usage.drain();
  }

  protected override onDestroy(): void {
    this.runningTurnsBySession.clear();
    this.listeners.clear();
  }

  async reconcileInterruptedTurns(): Promise<number> {
    return this.store.reconcileInterrupted(INTERRUPTED_ERROR);
  }

  // ── Protocol operations ──

  async createSession(input: {
    agentId: string;
    executionTarget: AgentExecutionTarget;
    title?: string;
  }): Promise<AgentSessionView> {
    const parsed = AgentCreateSessionInputSchema.parse(input);
    const agent = await this.agents.getAgent(parsed.agentId);
    if (!agent) {
      fail('AGENT_NOT_FOUND', `Agent does not exist: ${parsed.agentId}`);
    }
    return this.store.createSession({
      agentId: parsed.agentId,
      title: parsed.title,
    });
  }

  async renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView> {
    const parsed = AgentRenameSessionInputSchema.parse(input);
    const session = await this.store.renameSession(parsed.sessionId, parsed.title);
    if (!session) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${parsed.sessionId}`);
    }
    this.updateBackgroundReplyTitle(session.id, session.title);
    this.publish(parsed.sessionId, { type: 'session.updated', session });
    return session;
  }

  async deleteSession(input: { sessionId: string }): Promise<void> {
    const parsed = AgentDeleteSessionInputSchema.parse(input);
    const { sessionId } = parsed;
    if (this.deletingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session is already being deleted.');
    }
    // Install the barrier before the first await: submissions that begin after
    // this point fail closed, while an already-admitted submission may finish
    // installing its active/running state for us to cancel and drain below.
    this.deletingSessions.add(sessionId);
    try {
      const admission = this.admittingSessions.get(sessionId);
      if (admission) {
        await admission.completion;
      }
      const active = this.activeTurns.get(sessionId);
      if (active) {
        await this.cancelTurn({ sessionId, turnId: active.turn.id });
      }
      const runningTurn = this.runningTurnsBySession.get(sessionId);
      if (runningTurn) {
        await runningTurn;
      }
      const cached = this.runtimeSessions.get(sessionId);
      if (cached) {
        this.runtimeSessions.delete(sessionId);
        await cached.session.close();
      }
      this.backgroundReply.clearSession(sessionId);
      const deleted = await this.store.deleteSession(sessionId);
      if (!deleted) {
        fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
      }
      this.listeners.delete(sessionId);
    } finally {
      this.deletingSessions.delete(sessionId);
    }
  }

  async submitMessage(
    input: AgentSubmitMessageInput,
  ): Promise<{ turnId: string; userMessageId: string; assistantMessageId: string }> {
    const parsed = AgentSubmitMessageInputSchema.parse(input);
    const { sessionId } = parsed;
    this.assertIdle(sessionId);
    // Synchronous admission guard: a second submit that interleaves at any
    // await below still fails SESSION_BUSY (invariant 1).
    const completion = createCompletionSignal();
    const abortController = new AbortController();
    const { signal } = abortController;
    this.admittingSessions.set(sessionId, {
      abortController,
      completion: completion.promise,
    });
    try {
      const session = await raceAbort(this.store.getSession(sessionId), signal);
      if (!session) {
        fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
      }
      const configuredAgent = await raceAbort(this.requireAgent(session.agentId), signal);
      const agent = applyTurnOverrides(configuredAgent, parsed);
      const runtime = this.routeExecutionTarget(session.executionTarget);
      if (
        !runtime.descriptor.capabilities.attachments &&
        parsed.parts.some((part) => part.type === 'file')
      ) {
        fail('CAPABILITY_UNSUPPORTED', 'File attachments are not supported for this Agent.');
      }

      const storedContextCandidate = await raceAbort(
        this.store.getLatestContextCheckpoint(sessionId),
        signal,
      );
      const checkpointValidation = storedContextCandidate
        ? validateRuntimeContextCheckpointCandidate(storedContextCandidate.checkpoint)
        : null;
      const requestedCheckpoint = checkpointValidation?.checkpoint ?? null;
      const storedTurnContext = await raceAbort(
        this.store.loadRuntimeTurnContext(sessionId, requestedCheckpoint?.anchorTurnId ?? null),
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
      const { availableFiles, inputFiles, parts } = await this.resolveManagedInput(
        parsed.parts,
        storedTurnContext.history,
        signal,
      );
      const resources = createTurnResourceLedger(
        inputFiles,
        storedTurnContext.referencedFileEntryIds,
        availableFiles,
      );

      // Freeze system capabilities and configured MCP tools for the turn so mid-turn changes
      // cannot alter the active catalog. The catalog closes over this turn's
      // resource ledger, never a global file surface. System capability
      // resolution remains optional; configured MCP binding resolution fails closed.
      let systemTools: readonly RuntimeTool[] = [];
      let configuredTools: readonly RuntimeTool[] = [];
      if (runtime.descriptor.capabilities.tools) {
        try {
          systemTools = await raceAbort(
            this.systemCapabilities.getTools({
              model: agent.model,
              resources,
              temporaryCapabilities: new Set(parsed.temporaryCapabilities ?? []),
            }),
            signal,
          );
        } catch (error) {
          signal.throwIfAborted();
          logger.warn(
            'Failed to resolve system capabilities; continuing without them',
            error as Error,
          );
        }
        try {
          configuredTools = await raceAbort(this.runtimeTools.resolve(agent.id), signal);
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
        inferenceModel = await raceAbort(this.inferenceModel(agent.model), signal);
      } catch {
        signal.throwIfAborted();
        fail('EXECUTION_UNAVAILABLE', 'The selected model is unavailable.');
      }
      const modelPreflight = await this.preflightModel(runtime, agent, signal);
      if (tools.length > 0 && !modelPreflight.supportsTools) {
        fail('CAPABILITY_UNSUPPORTED', 'The selected model does not support native tool calling.');
      }
      const inferenceSnapshot = createAgentInferenceSnapshot({
        model: inferenceModel,
        options: agent.options,
        tools,
      });

      this.assertAttachmentRequestSupported(
        runtime,
        parts,
        storedTurnContext.history,
        resources,
        modelPreflight,
      );
      const runtimeTextAttachments = await this.resolveRuntimeTextAttachments(
        parts,
        storedTurnContext.history,
        resources,
        signal,
      );

      // Open the Runtime before creating durable pending rows. A failed open
      // must leave no reservation that startup reconciliation has to repair.
      const runtimeSession = await this.getRuntimeSession(sessionId, runtime, signal);
      signal.throwIfAborted();

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

      // Invariant 2: reservation commits before execution starts.
      const reserved = await this.store.reserveSubmission({
        sessionId,
        userParts,
        modelId: inferenceSnapshot.model.uniqueModelId,
        inferenceSnapshot,
      });

      // The Turn projection starts here: reservation time is the turn start.
      const turn: AgentTurnView = {
        id: reserved.turnId,
        sessionId,
        status: 'running',
        assistantMessageId: reserved.assistantMessage.id,
        error: null,
        startedAt: reserved.assistantMessage.createdAt,
        endedAt: null,
      };
      const state: ActiveTurnState = {
        agent,
        abortController,
        turn,
        assistantMessage: reserved.assistantMessage,
        autoNamePromise: null,
        autoNameUserParts: storedTurnContext.hasMessages ? null : parts,
        backgroundReply: this.startBackgroundReply({
          agentId: agent.id,
          agentName: agent.name,
          sessionId,
          sessionTitle: session.title,
        }),
        pendingApprovals: new Map(),
        pendingContextCheckpoint: null,
        resources,
        sessionTurnIds: new Set([...storedTurnContext.sessionTurnIds, reserved.turnId]),
        usage: null,
        runtimeSession,
      };
      this.activeTurns.set(sessionId, state);

      this.publish(sessionId, { type: 'message.created', message: reserved.userMessage });
      this.publish(sessionId, { type: 'message.created', message: reserved.assistantMessage });
      this.publish(sessionId, { type: 'turn.updated', turn });
      if (state.autoNameUserParts && !signal.aborted) {
        state.autoNamePromise = this.naming.maybeRenameFromFirstUserMessage(
          sessionId,
          state.autoNameUserParts,
        );
        this.publishSessionRename(state.autoNamePromise);
      }

      const run = this.runTurn(
        sessionId,
        agent,
        state,
        storedTurnContext.history,
        parts,
        runtimeContextCheckpoint,
        runtimeTextAttachments,
        modelPreflight,
        tools,
      );
      this.runningTurns.add(run);
      this.runningTurnsBySession.set(sessionId, run);
      void run.finally(() => {
        this.runningTurns.delete(run);
        if (this.runningTurnsBySession.get(sessionId) === run) {
          this.runningTurnsBySession.delete(sessionId);
        }
      });

      return {
        turnId: reserved.turnId,
        userMessageId: reserved.userMessage.id,
        assistantMessageId: reserved.assistantMessage.id,
      };
    } finally {
      this.admittingSessions.delete(sessionId);
      completion.resolve();
    }
  }

  async cancelTurn(input: { sessionId: string; turnId: string }): Promise<void> {
    const parsed = AgentCancelTurnInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    if (!active || active.turn.id !== parsed.turnId) {
      return; // invariant 6: idempotent, including after the turn settled
    }
    if (active.turn.status !== 'cancelling') {
      active.turn = { ...active.turn, status: 'cancelling' };
      this.publish(parsed.sessionId, { type: 'turn.updated', turn: active.turn });
    }
    active.abortController.abort(new Error('The turn was cancelled.'));
    await active.runtimeSession.cancel(parsed.turnId);
  }

  async respondApproval(input: {
    sessionId: string;
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void> {
    const parsed = AgentRespondApprovalInputSchema.parse(input);
    const active = this.activeTurns.get(parsed.sessionId);
    const approval = active?.pendingApprovals.get(parsed.approvalId);
    // Invariant 7: correlate to the active Session, turn, and approval; fail closed.
    if (!active || active.turn.id !== parsed.turnId || approval?.status !== 'pending') {
      fail('APPROVAL_NOT_FOUND', 'The approval is not pending on the active turn.');
    }
    await active.runtimeSession.respondApproval({
      turnId: parsed.turnId,
      approvalId: parsed.approvalId,
      decision: parsed.decision,
    });
  }

  async observeSession(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<AgentSessionObservation> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      fail('SESSION_NOT_FOUND', `Session does not exist: ${sessionId}`);
    }
    const agent = await this.requireAgent(session.agentId);
    const capabilities = this.projectCapabilities(session.executionTarget);

    // Snapshot capture and listener registration are one synchronous section:
    // no event can fall into a snapshot/subscription gap (invariant 8).
    const active = this.activeTurns.get(sessionId);
    const snapshot = AgentSessionSnapshotSchema.parse(
      cloneJson({
        agent: { id: agent.id, name: agent.name },
        session,
        capabilities,
        activeTurn: active?.turn ?? null,
        streamingMessage: active?.assistantMessage ?? null,
        pendingApprovals: active
          ? [...active.pendingApprovals.values()].filter((entry) => entry.status === 'pending')
          : [],
      }),
    );
    const sessionListeners = this.listeners.get(sessionId) ?? new Set();
    this.listeners.set(sessionId, sessionListeners);
    sessionListeners.add(listener);

    return {
      snapshot,
      unsubscribe: () => {
        sessionListeners.delete(listener);
      },
    };
  }

  // ── Execution ──

  private async runTurn(
    sessionId: string,
    agent: AgentDefinition,
    state: ActiveTurnState,
    history: AgentMessageView[],
    inputParts: AgentInputPart[],
    storedContextCheckpoint: RuntimeContextCheckpoint | null,
    runtimeTextAttachments: RuntimeAttachmentContents,
    modelPreflight: RuntimeModelPreflight,
    tools: readonly RuntimeTool[],
  ): Promise<void> {
    try {
      const runtimeAttachments = new Map(runtimeTextAttachments);
      if (modelPreflight.inputModalities.includes('image')) {
        const runtimeImages = await this.resolveRuntimeImages(
          state.resources,
          state.abortController.signal,
        );
        for (const [fileEntryId, image] of runtimeImages) {
          runtimeAttachments.set(fileEntryId, image);
        }
      } else {
        const omitImage = (fileEntryId: string, mediaType: string) => {
          const text = unsupportedMediaNote(mediaType, NO_IMAGE_MEDIA_CAPABILITIES);
          if (text) runtimeAttachments.set(fileEntryId, { type: 'text', text });
        };
        for (const part of inputParts) {
          if (part.type === 'file') omitImage(part.fileEntryId, part.mediaType);
        }
        for (const message of history) {
          if (message.role !== 'user') continue;
          for (const part of message.parts) {
            if (part.type === 'file' && part.purpose === 'input-attachment') {
              omitImage(part.fileEntryId, part.mediaType);
            }
          }
        }
      }
      state.abortController.signal.throwIfAborted();
      const events = state.runtimeSession.execute({
        turnId: state.turn.id,
        instructions: agent.instructions,
        model: agent.model,
        history: toRuntimeHistory(history, runtimeAttachments),
        contextCheckpoint: storedContextCheckpoint,
        input: toRuntimeInputParts(inputParts, state.resources, runtimeAttachments),
        tools: [...tools],
        options: agent.options,
      });
      for await (const event of events) {
        const isTerminal = await this.handleRuntimeEvent(sessionId, state, event);
        if (isTerminal) {
          return;
        }
      }
      // Defensive: a conforming runtime always emits a terminal event.
      await this.finalize(
        sessionId,
        state,
        'failed',
        toAgentErrorView({
          code: 'missing_terminal_event',
          message: 'The runtime ended without a terminal event.',
          retryable: false,
          origin: 'host',
        }),
      );
    } catch (error) {
      if (error instanceof TerminalPersistenceError) {
        this.handleTerminalPersistenceFailure(sessionId, state, error);
        return;
      }
      if (state.abortController.signal.aborted) {
        try {
          await this.finalize(sessionId, state, 'cancelled', null);
        } catch (finalizeError) {
          this.handleTerminalPersistenceFailure(sessionId, state, finalizeError);
        }
        return;
      }
      logger.error('Agent turn failed outside the runtime event stream', error as Error);
      try {
        await this.finalize(
          sessionId,
          state,
          'failed',
          toAgentErrorView({
            code: 'host_error',
            message: 'The turn failed unexpectedly.',
            retryable: false,
            origin: 'host',
            ...(error instanceof Error ? { name: error.name } : {}),
          }),
        );
      } catch (finalizeError) {
        this.handleTerminalPersistenceFailure(sessionId, state, finalizeError);
      }
    }
  }

  /** Returns true when the event was terminal for the turn. */
  private async handleRuntimeEvent(
    sessionId: string,
    state: ActiveTurnState,
    event: RuntimeEvent,
  ): Promise<boolean> {
    switch (event.type) {
      case 'part.add': {
        const part = toAgentMessagePart(event.part);
        if (part.type === 'file') {
          // A Host-validated artifact joins the turn ledger, so the model may
          // reference it later in this same turn (monotonic grant, never a
          // tool-side widening).
          state.resources.grantFile(part.fileEntryId);
        }
        state.assistantMessage.parts.push(part);
        if (state.assistantMessage.status === 'pending') {
          state.assistantMessage.status = 'streaming';
        }
        this.publish(sessionId, {
          type: 'message.delta',
          messageId: state.assistantMessage.id,
          delta: { op: 'part.add', index: event.index, part },
        });
        state.backgroundReply.update(state.assistantMessage);
        return false;
      }
      case 'text.delta': {
        const part = state.assistantMessage.parts.find((entry) => entry.id === event.partId);
        if (part && (part.type === 'text' || part.type === 'reasoning')) {
          part.text += event.text;
        }
        this.publish(sessionId, {
          type: 'message.delta',
          messageId: state.assistantMessage.id,
          delta: { op: 'text.append', partId: event.partId, text: event.text },
        });
        state.backgroundReply.update(state.assistantMessage);
        return false;
      }
      case 'part.replace': {
        const part = toAgentMessagePart(event.part);
        const index = state.assistantMessage.parts.findIndex((entry) => entry.id === part.id);
        if (index >= 0) {
          state.assistantMessage.parts[index] = part;
        }
        this.publish(sessionId, {
          type: 'message.delta',
          messageId: state.assistantMessage.id,
          delta: { op: 'part.replace', part },
        });
        state.backgroundReply.update(state.assistantMessage);
        return false;
      }
      case 'approval.requested': {
        // Approvals and live turn status are Host state by design: they never
        // survive a restart (agent-persistence.md).
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.pendingApprovals.set(approval.id, approval);
        state.turn = { ...state.turn, status: 'awaiting-approval' };
        state.backgroundReply.awaitApproval(state.assistantMessage);
        this.publish(sessionId, { type: 'turn.updated', turn: state.turn });
        this.publish(sessionId, { type: 'approval.requested', approval });
        return false;
      }
      case 'approval.resolved': {
        const approval = toAgentApprovalView(event.approval, sessionId);
        state.pendingApprovals.set(approval.id, approval);
        const hasPending = [...state.pendingApprovals.values()].some(
          (entry) => entry.status === 'pending',
        );
        if (!hasPending && state.turn.status === 'awaiting-approval') {
          state.turn = { ...state.turn, status: 'running' };
          this.publish(sessionId, { type: 'turn.updated', turn: state.turn });
        }
        state.backgroundReply.update(state.assistantMessage);
        this.publish(sessionId, { type: 'approval.resolved', approval });
        return false;
      }
      case 'usage': {
        // Cumulative; the last report before the terminal event is authoritative.
        state.usage = {
          completedAt: event.completedAt,
          context: event.context,
          usage: event.usage,
        };
        return false;
      }
      case 'context.checkpoint': {
        const validation = validateRuntimeContextCheckpoint(event.checkpoint, state.sessionTurnIds);
        if (validation.issue) {
          state.pendingContextCheckpoint = null;
          logger.warn('Agent context checkpoint rejected before persistence', {
            code: validation.issue,
            sessionId,
          });
        } else {
          state.pendingContextCheckpoint = validation.checkpoint;
        }
        return false;
      }
      case 'completed':
        await this.finalize(sessionId, state, 'completed', null);
        return true;
      case 'failed':
        await this.finalize(sessionId, state, 'failed', toAgentErrorView(event.error));
        return true;
      case 'cancelled':
        await this.finalize(sessionId, state, 'cancelled', null);
        return true;
      default:
        return false;
    }
  }

  private async finalize(
    sessionId: string,
    state: ActiveTurnState,
    outcome: 'completed' | 'failed' | 'cancelled',
    error: AgentErrorView | null,
  ): Promise<void> {
    const parts: AgentMessagePart[] = interruptNonTerminalToolParts(
      state.assistantMessage.parts.map((part) =>
        (part.type === 'text' || part.type === 'reasoning') && part.state === 'streaming'
          ? { ...part, state: 'done' }
          : part,
      ),
      'The turn ended before this tool call completed.',
    );
    if (outcome === 'failed' && error) {
      parts.push({ id: `error-${state.turn.id}`, type: 'error', error });
    }
    const messageStatus =
      outcome === 'completed' ? 'success' : outcome === 'failed' ? 'error' : 'cancelled';

    // Invariant 5: the terminal message state (including the turn-level error)
    // commits before the terminal events publish. The terminal turn view is a
    // projection of that committed message.
    const finalized = await this.persistTerminalState({
      assistantMessageId: state.assistantMessage.id,
      status: messageStatus,
      parts,
      usage: state.usage ? toAgentUsageView(state.usage.usage) : null,
      error,
      contextCheckpoint: outcome === 'completed' ? state.pendingContextCheckpoint : null,
    });
    const turn: AgentTurnView = {
      ...state.turn,
      status: outcome,
      error,
      endedAt: finalized.updatedAt,
    };

    if (this.activeTurns.get(sessionId) === state) {
      this.activeTurns.delete(sessionId);
    }
    if (outcome === 'failed' && error) {
      logger.error('Agent turn reached a failed terminal state', {
        assistantMessageId: finalized.id,
        durationMs: Math.max(0, Date.parse(finalized.updatedAt) - Date.parse(state.turn.startedAt)),
        hasUsage: state.usage !== null,
        modelId: error.failure?.context?.modelId ?? state.agent.model.modelId,
        providerId: error.failure?.context?.providerId ?? state.agent.model.providerId,
        reasonCode: error.failure?.reasonCode ?? 'unknown',
        retryable: error.retryable,
        sessionId,
        sourceCode: error.failure?.source.code,
        sourceLayer: error.failure?.source.layer,
        statusCode: error.failure?.context?.statusCode,
        totalTokens: state.usage?.usage.totalTokens,
        turnId: state.turn.id,
      });
    }
    if (state.usage) {
      this.usage.record({
        agent: state.agent,
        assistantMessageId: finalized.id,
        report: state.usage,
        turnId: state.turn.id,
      });
    }
    this.publish(sessionId, { type: 'message.finalized', message: finalized });
    this.publish(sessionId, { type: 'turn.updated', turn });
    const namingPromises = state.autoNamePromise ? [state.autoNamePromise] : [];
    if (outcome === 'completed' && state.autoNameUserParts) {
      const summaryNamePromise = this.naming.maybeRenameFromConversationSummary({
        assistantParts: finalized.parts,
        sessionId,
        userParts: state.autoNameUserParts,
      });
      namingPromises.push(summaryNamePromise);
      this.publishSessionRename(summaryNamePromise);
    }
    state.backgroundReply.finish(
      outcome,
      namingPromises.length > 0 ? { waitFor: Promise.allSettled(namingPromises) } : undefined,
    );
  }

  private async persistTerminalState(
    input: Parameters<AgentSessionStore['finalizeAssistantMessage']>[0],
  ): Promise<AgentMessageView> {
    let lastFailure: unknown;
    for (const delayMs of TERMINAL_PERSISTENCE_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        return await this.store.finalizeAssistantMessage(input);
      } catch (error) {
        lastFailure = error;
      }
    }
    throw new TerminalPersistenceError(lastFailure);
  }

  private handleTerminalPersistenceFailure(
    sessionId: string,
    state: ActiveTurnState,
    error: unknown,
  ): void {
    // There is no valid volatile terminal projection without its durable row.
    // Fail the entire Host generation closed and retain the active turn; the
    // next generation's startup reconciliation will mark the placeholder
    // interrupted once persistence is available again.
    this.acceptingSubmissions = false;
    const failure = error instanceof TerminalPersistenceError ? error.failure : error;
    logger.error(
      'Agent Host entered a fatal state after terminal persistence failed',
      failure as Error,
      {
        assistantMessageId: state.assistantMessage.id,
        sessionId,
        turnId: state.turn.id,
      },
    );
  }

  // ── Helpers ──

  private async resolveManagedInput(
    parts: AgentInputPart[],
    history: AgentMessageView[],
    signal: AbortSignal,
  ) {
    const fileEntryIds = parts.flatMap((part) => {
      if (part.type !== 'file') {
        return [];
      }
      const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
      if (!parsed.success) {
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
      }
      return [parsed.data];
    });

    const historicalFileEntryIds = history.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== 'file' || part.purpose !== 'input-attachment') {
          return [];
        }
        const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
        return parsed.success ? [parsed.data] : [];
      }),
    );
    let availableFiles: Awaited<ReturnType<ManagedFileResolver['resolveAvailable']>> = new Map();
    if (fileEntryIds.length > 0 || historicalFileEntryIds.length > 0) {
      try {
        availableFiles = await raceAbort(
          this.files.resolveAvailable([...fileEntryIds, ...historicalFileEntryIds]),
          signal,
        );
      } catch {
        signal.throwIfAborted();
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file could not be verified.');
      }
    }

    const inputFiles = new Map(
      fileEntryIds.flatMap((fileEntryId) => {
        const fact = availableFiles.get(fileEntryId);
        return fact ? [[fileEntryId, fact] as const] : [];
      }),
    );

    const canonicalParts = parts.map((part): AgentInputPart => {
      if (part.type !== 'file') {
        return part;
      }
      const fact = inputFiles.get(part.fileEntryId);
      if (!fact) {
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
      }
      if (
        part.mediaType !== fact.mediaType ||
        (part.name !== undefined && part.name !== fact.name)
      ) {
        fail('ATTACHMENT_METADATA_MISMATCH', 'Attached file metadata could not be verified.');
      }
      return {
        type: 'file',
        fileEntryId: fact.fileEntryId,
        mediaType: fact.mediaType,
        name: fact.name,
      };
    });

    return { availableFiles, inputFiles, parts: canonicalParts };
  }

  private async preflightModel(
    runtime: AgentRuntime,
    agent: AgentDefinition,
    signal: AbortSignal,
  ): Promise<RuntimeModelPreflight> {
    try {
      return await raceAbort(runtime.preflightModel(agent.model), signal);
    } catch {
      signal.throwIfAborted();
      fail(
        'CAPABILITY_UNSUPPORTED',
        'The selected model or provider endpoint cannot execute this turn.',
      );
    }
  }

  private assertAttachmentRequestSupported(
    runtime: AgentRuntime,
    input: AgentInputPart[],
    history: AgentMessageView[],
    resources: TurnResourceLedger,
    model: RuntimeModelPreflight,
  ): void {
    let hasAttachments = false;
    const images = input.flatMap((part) => {
      if (part.type !== 'file') {
        return [];
      }
      const fact = resources.inputFiles.get(part.fileEntryId);
      if (!fact) {
        fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
      }
      hasAttachments = true;
      if (isAiSupportedImageMediaType(fact.mediaType)) {
        return [fact];
      }
      if (isSupportedTextAttachment(fact)) {
        return [];
      }
      fail('ATTACHMENT_INVALID', unsupportedAttachmentMessage(fact));
    });

    for (const message of history) {
      for (const part of message.parts) {
        if (part.type !== 'file' || part.purpose !== 'input-attachment') {
          continue;
        }
        const fact = resources.availableFiles.get(part.fileEntryId);
        if (fact && isAiSupportedImageMediaType(fact.mediaType)) {
          hasAttachments = true;
          images.push(fact);
        } else if (fact && isSupportedTextAttachment(fact)) {
          hasAttachments = true;
        }
      }
    }

    if (!hasAttachments) {
      return;
    }
    if (!runtime.descriptor.capabilities.attachments) {
      fail('CAPABILITY_UNSUPPORTED', 'The selected runtime does not support file attachments.');
    }
    if (images.length === 0) {
      return;
    }
    if (!model.inputModalities.includes('image')) {
      // runTurn replaces these references with text notes without reading image bytes.
      return;
    }

    const limit = findImageAttachmentLimit(images, model);
    if (limit) {
      fail('CAPABILITY_UNSUPPORTED', imageAttachmentLimitMessage(limit));
    }
  }

  private async resolveRuntimeTextAttachments(
    input: AgentInputPart[],
    history: AgentMessageView[],
    resources: TurnResourceLedger,
    signal: AbortSignal,
  ): Promise<RuntimeAttachmentContents> {
    const currentFileEntryIds = input.flatMap((part) =>
      part.type === 'file' ? [part.fileEntryId] : [],
    );
    const historicalFileEntryIds: string[] = [];
    for (let messageIndex = history.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const parts = history[messageIndex]?.parts ?? [];
      for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = parts[partIndex];
        if (part?.type === 'file' && part.purpose === 'input-attachment') {
          historicalFileEntryIds.push(part.fileEntryId);
        }
      }
    }

    try {
      return await resolveManagedTextAttachments({
        availableFiles: resources.availableFiles,
        currentFileEntryIds,
        historicalFileEntryIds,
        readBytes: (file, signal) => this.files.readAsBytes(file, signal),
        signal,
      });
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof TextAttachmentError) {
        fail(
          error.failure === 'unavailable' ? 'ATTACHMENT_UNAVAILABLE' : 'ATTACHMENT_INVALID',
          error.message,
        );
      }
      fail('ATTACHMENT_UNAVAILABLE', 'An attached text file could not be resolved.');
    }
  }

  private async resolveRuntimeImages(
    resources: TurnResourceLedger,
    signal: AbortSignal,
  ): Promise<RuntimeAttachmentContents> {
    const files = new Map<string, Extract<RuntimeInputPart, { type: 'file' }>>();
    for (const fact of resources.availableFiles.values()) {
      if (!isAiSupportedImageMediaType(fact.mediaType)) {
        continue;
      }
      try {
        const uri = await this.files.readAsDataUrl(fact, signal);
        signal.throwIfAborted();
        if (!uri || !uri.startsWith(`data:${fact.mediaType};base64,`)) {
          if (resources.inputFiles.has(fact.fileEntryId)) {
            throw new Error('A current managed image became unavailable.');
          }
          continue;
        }
        files.set(fact.fileEntryId, {
          type: 'file',
          mediaType: fact.mediaType,
          name: fact.name,
          uri,
        });
      } catch {
        if (signal.aborted) {
          throw signal.reason ?? new Error('Managed image resolution was aborted.');
        }
        if (resources.inputFiles.has(fact.fileEntryId)) {
          throw new Error('A current managed image could not be read.');
        }
      }
    }
    return files;
  }

  private assertIdle(sessionId: string): void {
    if (!this.acceptingSubmissions) {
      fail('EXECUTION_UNAVAILABLE', 'The Agent Host is stopping.');
    }
    if (this.deletingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session is being deleted.');
    }
    if (this.activeTurns.has(sessionId) || this.admittingSessions.has(sessionId)) {
      fail('SESSION_BUSY', 'The session already has an active turn.');
    }
  }

  private async requireAgent(agentId: string): Promise<AgentDefinition> {
    const agent = await this.agents.getAgent(agentId);
    if (!agent) {
      fail('AGENT_NOT_FOUND', `Agent does not exist: ${agentId}`);
    }
    return agent;
  }

  private routeExecutionTarget(target: AgentExecutionTarget): AgentRuntime {
    if (target.kind !== 'local') {
      fail('EXECUTION_UNAVAILABLE', 'No runtime can execute this Agent configuration.');
    }
    return this.runtime;
  }

  private projectCapabilities(target: AgentExecutionTarget): AgentCapabilities {
    const runtime = this.routeExecutionTarget(target);
    return { ...runtime.descriptor.capabilities };
  }

  private startBackgroundReply(input: {
    agentId: string;
    agentName: string;
    sessionId: string;
    sessionTitle: string;
  }): BackgroundReplyTurn {
    try {
      return this.backgroundReply.startTurn(input);
    } catch (error) {
      logger.warn('Failed to start Agent Session background reply', error as Error, {
        sessionId: input.sessionId,
      });
      this.backgroundReply.clearSession(input.sessionId);
      return NOOP_BACKGROUND_REPLY_TURN;
    }
  }

  /**
   * One Pi Runtime session per active application Session. The descriptor check
   * keeps the cache safe for tests that replace the injected Runtime.
   */
  private async getRuntimeSession(
    sessionId: string,
    runtime: AgentRuntime,
    signal: AbortSignal,
  ): Promise<AgentRuntimeSession> {
    signal.throwIfAborted();
    const cached = this.runtimeSessions.get(sessionId);
    if (cached && cached.runtimeId === runtime.descriptor.id) {
      return cached.session;
    }
    if (cached) {
      this.runtimeSessions.delete(sessionId);
      await raceAbort(cached.session.close(), signal);
    }
    const opening = runtime.open();
    try {
      const session = await raceAbort(opening, signal);
      signal.throwIfAborted();
      this.runtimeSessions.set(sessionId, { runtimeId: runtime.descriptor.id, session });
      return session;
    } catch (error) {
      if (signal.aborted) {
        void opening
          .then((session) => session.close())
          .catch((closeError: unknown) =>
            logger.warn('Failed to close an aborted runtime session open', closeError as Error),
          );
      }
      throw error;
    }
  }

  private publish(sessionId: string, event: AgentEvent): void {
    const sessionListeners = this.listeners.get(sessionId);
    if (!sessionListeners || sessionListeners.size === 0) {
      return;
    }
    // Boundary clone: enforces JSON-safety (invariant 9) and detaches
    // listeners from the Host's live streaming state.
    const cloned = cloneJson(event);
    for (const listener of sessionListeners) {
      try {
        listener(cloned);
      } catch (error) {
        logger.warn('Agent event listener threw', error as Error);
      }
    }
  }

  private updateBackgroundReplyTitle(sessionId: string, title: string): void {
    try {
      this.backgroundReply.updateSessionTitle(sessionId, title);
    } catch (error) {
      logger.warn('Failed to update Agent Session background reply title', error as Error, {
        sessionId,
      });
    }
  }

  private publishSessionRename(promise: Promise<AgentSessionView | null>): void {
    void promise
      .then((session) => {
        if (session) {
          this.updateBackgroundReplyTitle(session.id, session.title);
          this.publish(session.id, { type: 'session.updated', session });
        }
      })
      .catch((error: unknown) => {
        logger.warn('Agent Session auto-naming failed', error as Error);
      });
  }
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
    const approval = applyToolApprovalMode(tool.approval, mode);
    return approval === tool.approval ? tool : { ...tool, approval };
  });
}

function imageAttachmentLimitMessage(limit: ImageAttachmentLimit): string {
  switch (limit) {
    case 'count':
      return 'Too many images are attached to this request.';
    case 'file-bytes':
      return 'An attached image exceeds the per-file size limit.';
    case 'total-bytes':
      return 'The attached images exceed the total request size limit.';
    case 'context':
      return 'The attached images exceed the selected model context budget.';
  }
}

function unsupportedAttachmentMessage(file: ManagedFileFact): string {
  return `Attachment ${JSON.stringify(file.name)} has unsupported media type ${JSON.stringify(file.mediaType)}.`;
}
