import type { Context } from '@earendil-works/chord';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { CodemodeSandboxBase } from '@earendil-works/pi-codemode/native';
import {
  createRegistry,
  GenerationTask,
  hook,
  section,
  type AgentChange,
  type Cursor,
  type EntryId,
  CompactionEntry,
  ResetEntry,
  type HookApi,
  type JsonObject,
  type Registry,
  type Storage,
  type SubmissionRecord,
} from '@earendil-works/pi-durable';
import { createCodemodeExtension } from '@earendil-works/pi-durable/codemode';
import { SqliteStorage } from '@earendil-works/pi-durable/storage/sqlite';

import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  LANES_PER_SESSION,
  laneKey,
  parseLaneKey,
  runtimeLane,
  sameLane,
  type DurableAgentRuntime,
  type RuntimeConversationConfiguration,
  type RuntimeConversationEvent,
  type RuntimeConversationSeed,
  type RuntimeDurableSubmission,
  type RuntimeDurableTurn,
  type RuntimeExecutionIdentity,
  type RuntimeExecutionPorts,
  type RuntimeLane,
  type RuntimeSqlDatabase,
  type RuntimeUsageOwner,
} from '../durableTypes';
import type { RuntimeDescriptor, RuntimeTool, RuntimeUsageReport } from '../types';
import { toPiConversation } from './modelMessages';
import { PiCodemodeFiles, retainPiCodemodeArtifacts } from './piCodemodeFiles';
import { fitPiCodemodeOutput } from './piCodemodeOutput';
import { createPiCodemodeSandbox } from './piCodemodeSandbox';
import { cherryClientIdentity, createPiDurableModels, piDurableModelKey } from './piDurableModels';
import { PiDurableObserver } from './PiDurableObserver';
import {
  detachedJson,
  failedPiToolGroups,
  PiConfigurationSchema,
  piSubmissionMetadata,
  piToolBlueprint,
  projectPiTurn,
  readPiSubmission,
  type PiStoredConfiguration,
} from './piDurableProjection';
import { hasRunnablePiTasks, PiDurableRuntime } from './PiDurableRuntime';
import { createPiDurableToolExtension } from './piDurableTools';
import type { PiRuntimeDependencies } from './piModelTypes';
import { PiToolBudget } from './piToolBudget';
import {
  PI_WEB_FAILURE_GROUP,
  resolvePiWebToolRoutes,
  selectPiClientTools,
  type PiWebToolRoutes,
} from './piWebTools';
import { createPiContextCheckpoint, createWorkingPiEntries } from './piWorkingHistory';

const DESCRIPTOR: RuntimeDescriptor = {
  id: 'pi-durable',
  name: 'Pi Durable',
  capabilities: { reasoning: true, tools: true, approvals: true, attachments: true },
};
const logger = loggerService.withContext('PiDurableAgentRuntime');

// Pi persists only changed sections, keeping earlier request prefixes intact across local midnight.
const CURRENT_DATE_SECTION = section('current-date', () => {
  const date = new Date(Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `The current local date is \`${year}-${month}-${day}\`.`;
});

/** Persistent, runtime-neutral facade. Pi owns execution, its working context, queue and recovery. */
export class PiDurableAgentRuntime implements DurableAgentRuntime {
  async drainUsage() {
    await this.delivery;
    await this.deliverUsage();
  }
  readonly descriptor = DESCRIPTOR;
  private runtime: PiDurableRuntime | undefined;
  private ports: RuntimeExecutionPorts | undefined;
  private readonly registry: Registry = createRegistry();
  /** Keyed by {@link laneKey}, the engine's session key. */
  private readonly configurations = new Map<string, PiStoredConfiguration>();
  private readonly providerOwners = new Map<string, RuntimeLane>();
  /**
   * Bound slots by Cherry Session. Pi reads every unbound slot from storage, so they are
   * probed once; this facade is the only writer of slot bindings, and each write drops the entry.
   */
  private readonly slots = new Map<
    string,
    Promise<readonly { lane: RuntimeLane; revision: number }[]>
  >();
  private readonly requestOwners = new WeakMap<AbortSignal, RuntimeExecutionIdentity>();
  /** Conversation requests that may use a native web tool: no failed lookup in the turn. */
  private readonly webRequests = new WeakMap<AbortSignal, PiWebToolRoutes>();
  private readonly observers = new Set<PiDurableObserver>();
  private delivery: Promise<void> = Promise.resolve();
  private readonly models: ReturnType<typeof createPiDurableModels>;
  private codemodeSandbox: CodemodeSandboxBase | undefined;

  constructor(
    private readonly dependencies: PiRuntimeDependencies,
    private readonly createStorage: (
      database: RuntimeSqlDatabase,
    ) => Promise<Storage> = SqliteStorage.open,
  ) {
    this.models = createPiDurableModels(
      dependencies,
      async (providerId, signal) => {
        if (!signal) throw new Error('A durable model request requires cancellation ownership.');
        const owner = this.executionOwner(providerId, signal);
        await this.requirePorts().assertExecutionAllowed(owner, signal);
        if (owner.requestId) {
          const selected = await this.requireRuntime().inputRecord(laneKey(owner), owner.requestId);
          if (!selected) throw new Error('The model request has no durable input.');
          await this.grantInputFiles(owner);
        }
        signal.throwIfAborted();
        return this.requireRuntime().requestOptions(providerId);
      },
      async (providerId, signal) => {
        const owner = this.executionOwner(providerId, signal);
        return async (report) => {
          await this.requireRuntime().saveUsage(report.requestId, detachedJson({ owner, report }));
          // Delivery failure retains the outbox record. It must not cause the model to resend an answer.
          this.delivery = this.delivery
            .then(() => this.deliverUsage())
            .catch((error) => {
              logger.warn('Pi durable usage delivery failed', {
                error,
                operation: 'pi.usage_delivery',
              });
            });
        };
      },
      (providerId, signal) =>
        Promise.resolve(this.requirePorts().traceModel?.(this.executionOwner(providerId, signal))),
      (signal) => (signal ? this.webRequests.get(signal) : undefined),
    );
  }

  preflightModel(model: RuntimeConversationConfiguration['model']) {
    return Promise.resolve(this.dependencies.preflightModel(model));
  }

  async initialize(
    database: RuntimeSqlDatabase,
    ports: RuntimeExecutionPorts,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.runtime) throw new Error('The durable Agent runtime is already initialized.');
    this.ports = ports;
    this.codemodeSandbox = createPiCodemodeSandbox(ports.scriptSandbox);
    let storage: Storage | undefined;
    try {
      signal?.throwIfAborted();
      storage = await this.createStorage(database);
      signal?.throwIfAborted();
      this.runtime = await PiDurableRuntime.open(storage, {
        models: this.models.models,
        registry: this.registry,
        settings: () => ({
          followUpMode: 'one-at-a-time',
          afterFailedRun: 'continue',
          compaction: { modelOverrides: this.models.compactionOverrides },
        }),
        identity: cherryClientIdentity(),
        onReport: (error, info) => {
          logger.warn('Pi durable runtime reported a failure', {
            error,
            operation: `pi.${info.type}`,
            ...('task' in info && info.task
              ? { taskId: Number(info.task.id), taskKind: info.task.kind }
              : {}),
            ...('reason' in info ? { reasonCode: info.reason } : {}),
            ...('extension' in info ? { extension: info.extension } : {}),
            ...('callback' in info ? { callback: info.callback } : {}),
          });
        },
      });
      signal?.throwIfAborted();
      const opened = this.runtime;
      void opened.closed
        .then((end) => {
          if (end.reason !== 'failed' || this.runtime !== opened) return;
          logger.error('Pi storage session closed after a failure', { error: end.error });
          ports.onFailure?.({
            code: 'runtime_storage_failed',
            message: 'Agent storage failed. Reopen the session to resume unfinished work.',
            retryable: true,
            origin: 'runtime',
          });
        })
        .catch((error) => logger.warn('Could not report runtime closure', { error }));
      // Stored history needs no registry code. Rebuild only unfinished owners before any resume.
      for (const lane of await this.unfinishedLanes()) {
        signal?.throwIfAborted();
        const stored = await this.runtime.configuration(laneKey(lane));
        signal?.throwIfAborted();
        const configuration = PiConfigurationSchema.parse(stored);
        const agent = await this.installConfiguration(lane, configuration, true, signal);
        signal?.throwIfAborted();
        if (stored?.version === 1)
          await this.runtime.restoreConfiguration(
            laneKey(lane),
            detachedJson(configuration),
            agent,
          );
        signal?.throwIfAborted();
        await this.bindProvider(lane);
      }
      signal?.throwIfAborted();
    } catch (error) {
      try {
        if (this.runtime) await this.runtime.close();
        else if (storage) await storage.close(BACKGROUND_CONTEXT);
        else await database.close();
      } catch (closeError) {
        const failure = new AggregateError(
          [error, closeError],
          'Durable runtime initialization and cleanup failed.',
          { cause: error },
        );
        throw failure;
      } finally {
        await this.codemodeSandbox?.close();
        this.codemodeSandbox = undefined;
        this.runtime = undefined;
        this.ports = undefined;
        this.configurations.clear();
        this.providerOwners.clear();
        this.slots.clear();
      }
      throw error;
    }
  }

  resume(): void {
    this.delivery = this.delivery
      .then(() => this.deliverUsage())
      .catch((error) => {
        logger.warn('Pi durable usage delivery failed', { error, operation: 'pi.usage_delivery' });
      });
    this.requireRuntime().resume();
  }

  async watchWork(listener: (active: boolean) => void) {
    const watch = await this.requireRuntime().watchWork();
    const active = hasRunnablePiTasks(watch.value);
    watch.start(async (value) => listener(hasRunnablePiTasks(value)));
    let observing = true;
    void watch.closed.then(() => {
      if (observing) listener(false);
    });
    return {
      active,
      unsubscribe: async () => {
        observing = false;
        await watch.stop();
      },
    };
  }

  async close(): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) return;
    await Promise.allSettled([...this.observers].map((observer) => observer.stop()));
    await this.delivery;
    try {
      await runtime.close();
    } finally {
      await this.codemodeSandbox?.close();
      this.codemodeSandbox = undefined;
      this.runtime = undefined;
      this.ports = undefined;
      this.configurations.clear();
      this.providerOwners.clear();
      this.slots.clear();
      this.observers.clear();
      for (const extension of this.registry.snapshot().installed())
        this.registry.uninstall(extension);
    }
  }

  async sessions() {
    return (await this.requireRuntime().sessions()).map(({ sessionId, binding }) => ({
      lane: parseLaneKey(sessionId),
      revision: binding.revision,
    }));
  }

  /** Probes the Session's fixed slots instead of scanning every working copy. */
  async lanes(sessionId: string) {
    const runtime = this.requireRuntime();
    const cached = this.slots.get(sessionId);
    if (cached) return cached;
    const probe = (async () => {
      const lanes: { lane: RuntimeLane; revision: number }[] = [];
      for (let slot = 0; slot < LANES_PER_SESSION; slot++) {
        const lane = runtimeLane(sessionId, slot);
        const binding = await runtime.binding(laneKey(lane));
        if (binding?.conversationId !== undefined && binding.conversationId !== null)
          lanes.push({ lane, revision: binding.revision });
      }
      return lanes;
    })();
    this.slots.set(sessionId, probe);
    probe.catch(() => {
      if (this.slots.get(sessionId) === probe) this.slots.delete(sessionId);
    });
    return probe;
  }

  /** Drops the Session's bound slots once a binding write settles; a probe begun meanwhile is stale. */
  private async rebinding<Value>(lane: RuntimeLane, write: () => Promise<Value>) {
    try {
      return await write();
    } finally {
      this.slots.delete(lane.sessionId);
    }
  }

  /** The newest entry of a copy: a boundary that other lanes can fork from. */
  private async newestBoundary(key: string) {
    const [newest] = (await this.requireRuntime().history(key, 1)).entries;
    return newest ? `pi:${newest.id}` : undefined;
  }

  async hasConversation(lane: RuntimeLane) {
    return (await this.requireRuntime().conversation(laneKey(lane))) !== undefined;
  }

  async revision(lane: RuntimeLane) {
    return (await this.requireRuntime().binding(laneKey(lane)))?.revision;
  }

  async unfinishedLanes() {
    const runtime = this.requireRuntime();
    const inspection = await runtime.inspect();
    for (const task of inspection.tasks) {
      if (task.state.kind === 'blocked')
        logger.warn('Pi durable task blocked', {
          operation: 'pi.task',
          taskId: Number(task.record.id),
          taskKind: task.record.kind,
          reasonCode: task.state.reason,
          error: task.state.error,
        });
    }
    const conversations = new Set([
      ...inspection.tasks.map((task) => task.record.conversationId),
      ...inspection.submissions.map((submission) => submission.conversationId),
    ]);
    return (await runtime.sessions())
      .filter(
        ({ binding }) =>
          binding.conversationId !== null && conversations.has(binding.conversationId),
      )
      .map(({ sessionId }) => parseLaneKey(sessionId));
  }

  async configuration(lane: RuntimeLane): Promise<RuntimeConversationConfiguration> {
    const key = laneKey(lane);
    const stored =
      this.configurations.get(key) ??
      PiConfigurationSchema.parse(await this.requireRuntime().configuration(key));
    return {
      kind: stored.kind,
      model: { ...stored.model },
      instructions: stored.instructions,
      initialInstructions: stored.initialInstructions,
      options: { ...stored.options },
      tools: stored.tools.map((tool) => this.toolTemplate(tool)),
      ...(stored.webTools ? { webTools: { ...stored.webTools } } : {}),
    };
  }

  resourceFileEntryIds(lane: RuntimeLane) {
    return this.requireRuntime().resourceFileEntryIds(laneKey(lane));
  }

  async ensureConversation(seed: RuntimeConversationSeed, signal?: AbortSignal) {
    const runtime = this.requireRuntime();
    const key = laneKey(seed.lane);
    if (await runtime.conversation(key)) {
      if ((await runtime.binding(key))?.revision !== seed.revision)
        throw new Error('The working copy is obsolete.');
      return this.newestBoundary(key);
    }
    const configuration = await this.configurationBlueprint(seed.configuration);
    const agent = await this.installConfiguration(seed.lane, configuration);
    const model = this.requireModel(configuration);
    const originalEntries = seed.history
      ? createWorkingPiEntries(
          {
            turnId: 'history-import',
            sessionId: seed.lane.sessionId,
            instructions: configuration.instructions,
            model: configuration.model,
            options: configuration.options,
            tools: [],
            input: [],
            history: seed.history.history,
            contextCheckpoint: seed.history.contextCheckpoint,
          },
          model,
        )
      : undefined;
    signal?.throwIfAborted();
    await this.rebinding(seed.lane, () =>
      runtime.ensureConversation({
        sessionId: key,
        revision: seed.revision,
        agent,
        options: configuration.options,
        configuration: detachedJson(configuration),
        initialInstructions: configuration.initialInstructions,
        resourceFileEntryIds: seed.history?.referencedFileEntryIds ?? [],
        entries: originalEntries,
      }),
    );
    await this.bindProvider(seed.lane);
    return this.newestBoundary(key);
  }

  async forkConversation(
    seed: Parameters<DurableAgentRuntime['forkConversation']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    const runtime = this.requireRuntime();
    if (await runtime.conversation(laneKey(seed.lane)))
      throw new Error('The working copy already exists.');
    const configuration = await this.configurationBlueprint(seed.configuration);
    const agent = await this.installConfiguration(seed.lane, configuration);
    signal?.throwIfAborted();
    await this.rebinding(seed.lane, () =>
      runtime.forkConversation(laneKey(seed.from.lane), {
        sessionId: laneKey(seed.lane),
        revision: seed.revision,
        agent,
        options: configuration.options,
        configuration: detachedJson(configuration),
        initialInstructions: configuration.initialInstructions,
        at: parseBoundary(seed.from.boundary),
        resourceFileEntryIds: seed.referencedFileEntryIds,
      }),
    );
    await this.bindProvider(seed.lane);
  }

  async configure(lane: RuntimeLane, input: RuntimeConversationConfiguration): Promise<void> {
    const previous = this.configurations.get(laneKey(lane));
    const configuration = await this.configurationBlueprint(input);
    const agent = await this.installConfiguration(lane, configuration);
    try {
      await this.requireRuntime().configure(
        laneKey(lane),
        agent,
        configuration.options,
        BACKGROUND_CONTEXT,
        detachedJson(configuration),
        configuration.initialInstructions,
      );
      await this.bindProvider(lane);
    } catch (error) {
      if (previous) await this.installConfiguration(lane, previous);
      throw error;
    }
  }

  async submit(lane: RuntimeLane, input: RuntimeDurableSubmission): Promise<RuntimeDurableTurn> {
    const runtime = this.requireRuntime();
    const key = laneKey(lane);
    const configuration = this.requireConfiguration(key);
    const model = this.requireModel(configuration);
    const tools = configuration.tools.map((blueprint) => this.toolTemplate(blueprint));
    const assembled = toPiConversation(
      {
        turnId: input.turnId,
        sessionId: lane.sessionId,
        instructions: '',
        model: configuration.model,
        options: configuration.options,
        history: [],
        contextCheckpoint: null,
        tools: [],
        input: input.input,
        resume: input.resume,
      },
      model,
    );
    const prompt = assembled.resume?.length
      ? {
          ...assembled.prompt,
          content:
            'Continue the interrupted answer to the preceding user question. Use the completed tool results already in the conversation; do not repeat completed actions.',
        }
      : assembled.prompt;
    const submission = await runtime.submit(
      key,
      { type: 'input', requestId: input.requestId, content: prompt.content, whenBusy: 'followUp' },
      piSubmissionMetadata(input, tools),
      { userMessageId: input.userMessageId, assistantMessageId: input.assistantMessageId },
    );
    const record = await submission.status(BACKGROUND_CONTEXT);
    return this.project(lane, record, await runtime.submissionMetadata(record));
  }

  async observe(lane: RuntimeLane, listener: (event: RuntimeConversationEvent) => void) {
    const runtime = this.requireRuntime();
    const observer = new PiDurableObserver(runtime, lane, listener);
    const snapshot = await observer.start();
    this.observers.add(observer);
    return {
      snapshot,
      unsubscribe: async () => {
        this.observers.delete(observer);
        await observer.stop();
      },
    };
  }

  async history(
    lane: RuntimeLane,
    query: { limit: number; cursor?: string; requestIds?: readonly string[] },
  ) {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 128)
      throw new Error('A history page must contain between 1 and 128 turns.');
    const runtime = this.requireRuntime();
    let maxEntryId = query.cursor !== undefined ? parseBoundary(query.cursor) : undefined;
    const turns: RuntimeDurableTurn[] = [];
    let nextCursor: string | undefined;
    let cursor: Cursor | undefined;
    do {
      const page = await runtime.history(
        laneKey(lane),
        256,
        cursor,
        BACKGROUND_CONTEXT,
        maxEntryId !== undefined ? { maxEntryId } : {},
      );
      const visible = new Set(page.entries.map((entry) => entry.id));
      for (const { record, metadata } of [...page.submissions].sort(
        (a, b) => b.record.id - a.record.id,
      )) {
        if (record.type !== 'input' || record.entry === undefined || !visible.has(record.entry))
          continue;
        if (query.requestIds && (!record.requestId || !query.requestIds.includes(record.requestId)))
          continue;
        turns.push(await this.project(lane, record, metadata));
        if (turns.length === query.limit) {
          maxEntryId = (Number(record.entry) - 1) as EntryId;
          nextCursor = `pi:${maxEntryId}`;
          break;
        }
      }
      if (turns.length === query.limit || !page.next) break;
      cursor = page.next;
    } while (cursor !== undefined);
    return { turns, ...(nextCursor ? { nextCursor } : {}) };
  }

  async message(lane: RuntimeLane, messageId: string) {
    const runtime = this.requireRuntime();
    const selected = await runtime.submissionForMessage(laneKey(lane), messageId);
    if (!selected) return undefined;
    const turn = await this.project(lane, selected.record, selected.metadata);
    if (selected.role === 'assistant' && !turn.hasAssistant) return undefined;
    return { turn, role: selected.role };
  }

  async exportTurn(
    lane: RuntimeLane,
    requestId: string,
    options: { currentContext?: boolean } = {},
  ) {
    const runtime = this.requireRuntime();
    const record = await runtime.inputRecord(laneKey(lane), requestId);
    if (!record || record.type !== 'input' || record.status !== 'done')
      return { contextCheckpoint: null };
    const stored = readPiSubmission(await runtime.submissionMetadata(record));
    const conversation = await runtime.conversation(laneKey(lane));
    if (!conversation) throw new Error('The working copy is missing.');
    const view = await conversation.context(
      BACKGROUND_CONTEXT,
      options.currentContext ? {} : { at: record.answer },
    );
    const contextCheckpoint =
      view.head && (CompactionEntry.is(view.head) || ResetEntry.is(view.head))
        ? createPiContextCheckpoint(stored.turnId, view.messages)
        : null;
    return { contextCheckpoint };
  }

  async abort(lane: RuntimeLane) {
    await this.requireRuntime().stop(laneKey(lane));
  }

  async discardConversation(lane: RuntimeLane) {
    const runtime = this.requireRuntime();
    const key = laneKey(lane);
    if (!(await runtime.conversation(key))) return;
    await runtime.stop(key);
    await this.drainUsage();
    await this.rebinding(lane, () => runtime.retireSession(key));
    this.configurations.delete(key);
    for (const [providerId, owner] of this.providerOwners)
      if (sameLane(owner, lane)) this.providerOwners.delete(providerId);
    const name = `cherry.capabilities:${key}`;
    for (const extension of this.registry.snapshot().installed())
      if (extension.name === name) this.registry.uninstall(extension);
  }
  async withdraw(lane: RuntimeLane, requestId: string) {
    const result = await this.requireRuntime().withdrawInput(laneKey(lane), requestId);
    return result === 'already_placed'
      ? ('already-placed' as const)
      : result === 'not_found'
        ? ('not-found' as const)
        : result;
  }
  async hasUnfinishedWork() {
    const state = await this.requireRuntime().inspect();
    return state.tasks.length > 0 || state.submissions.length > 0;
  }

  private async project(
    lane: RuntimeLane,
    record: SubmissionRecord,
    metadata: JsonObject | undefined,
  ) {
    const runtime = this.requireRuntime();
    const conversation = await runtime.conversation(laneKey(lane));
    if (!conversation) throw new Error('The Pi conversation is missing.');
    const active = record.conversationId === conversation.id && record.status === 'placed';
    return projectPiTurn({
      lane,
      record,
      metadata,
      entries: await runtime.turnEntries(laneKey(lane), record),
      active,
      inherited: record.conversationId !== conversation.id,
    });
  }

  private async installConfiguration(
    lane: RuntimeLane,
    configuration: PiStoredConfiguration,
    rehydrating = false,
    signal?: AbortSignal,
  ): Promise<AgentChange> {
    const key = laneKey(lane);
    try {
      const existing = rehydrating
        ? this.models.getModel(configuration.model, configuration.kind)
        : undefined;
      if (!existing) await this.models.registerModel(configuration.model, configuration.kind);
    } catch (error) {
      // Historical reads stay available after a user removes a provider/model. A fresh configure
      // still preflights strictly, and Pi settles recovered requests with its native no-model result.
      if (!rehydrating) throw error;
    }
    signal?.throwIfAborted();
    const routes = configuration.webRoutes ?? { search: 'client', fetch: 'client' };
    const nativeWeb = routes.search === 'server' || routes.fetch === 'server';
    const extension = createPiDurableToolExtension({
      name: `cherry.capabilities:${key}`,
      acceptsImages:
        this.models.getModel(configuration.model, configuration.kind)?.input.includes('image') ??
        false,
      ...(this.codemodeSandbox && configuration.kind !== 'image'
        ? {
            codemode: createCodemodeExtension({
              sandbox: this.codemodeSandbox,
              models: false,
              // Every inlined declaration repeats a direct tool's schema; scripts discover signatures instead.
              inlineBudget: 0,
              // MCP provider names share this prefix. Earlier tool_search results also named the
              // group "mcp", so scripts in migrated conversations filter by it.
              namespaces: [
                { name: 'mcp', prefix: 'mcp_', description: 'Tools of the connected MCP servers.' },
              ],
              writeOutput: async (name, data, api, context) => {
                const writer = this.requirePorts().writeToolOutput;
                if (!writer) return { error: 'Managed output storage is unavailable.' };
                const signal = requireSignal(context);
                const identity = await this.taskIdentity(lane, api, context);
                await this.requirePorts().assertExecutionAllowed(identity, signal);
                try {
                  const previous = await api.snapshot(PiCodemodeFiles, api.taskId, context);
                  const artifact =
                    previous?.outputs[name] ??
                    (await writer(identity, { name, data: fitPiCodemodeOutput(data) }, signal));
                  await api.commit(async (tx) => {
                    (await tx.doc(PiCodemodeFiles, api.taskId)).outputs[name] = artifact;
                  }, context);
                  // Replay retries authorization even when the file receipt already exists.
                  await this.requirePorts().admitArtifacts(identity, [artifact], signal);
                  await this.requireRuntime().grantFiles(key, [artifact.ref.fileEntryId], context);
                  await retainPiCodemodeArtifacts(api, api.taskId, api.callId, [artifact], context);
                  return { path: `managed-file:${artifact.ref.fileEntryId}` };
                } catch {
                  signal.throwIfAborted();
                  return { error: 'Could not save the managed output file.' };
                }
              },
            }),
          }
        : {}),
      // A web capability reaches the model through one route: its function or the native tool.
      tools: selectPiClientTools(
        configuration.tools.map((blueprint) => this.toolTemplate(blueprint)),
        routes,
      ),
      previousFailures: async (api, context) => {
        const inputs = await this.requireRuntime().inputsForTask(api, context);
        const failures = await api.snapshot(PiToolBudget, api.conversationId, context);
        return inputs[0]
          ? [
              ...(failures?.inputId === inputs[0].record.id ? failures.failedGroups : []),
              ...failedPiToolGroups(
                await this.requireRuntime().turnEntries(key, inputs[0].record, context),
              ),
            ]
          : [];
      },
      beforeCall: async (call, api, context) => {
        // A failed native lookup is known only from the transcript, never from a tool result.
        return nativeWeb &&
          configuration.tools.find((tool) => tool.providerName === call.name)?.failureGroup ===
            PI_WEB_FAILURE_GROUP &&
          (await this.webLookupFailed(key, api, context))
          ? 'This tool group stopped after an earlier failure.'
          : undefined;
      },
      resolve: async (template, api, context) => {
        const identity = await this.taskIdentity(lane, api, context);
        const signal = requireSignal(context);
        await this.requirePorts().assertExecutionAllowed(identity, signal);
        return {
          tool: await this.requirePorts().resolveTool(identity, template.ref, signal),
          turnId: identity.turnId,
        };
      },
      approve: async (tool, input, call, api, context) => {
        const identity = await this.taskIdentity(lane, api, context);
        return (
          (await this.requirePorts().requestApproval(
            identity,
            {
              id: `pi:${api.taskId}:${call.id}`,
              turnId: identity.turnId,
              toolCallId: call.id,
              toolRef: tool.ref,
              displayName: tool.displayName,
              input,
              status: 'pending',
            },
            requireSignal(context),
          )) === 'approve'
        );
      },
      onResult: async (tool, result, api, context) => {
        if (result.failure?.scope === 'tool' && tool.failureGroup) {
          const inputs = await this.requireRuntime().inputsForTask(api, context);
          if (inputs.length !== 1)
            throw new Error('Cherry capabilities require one owning input per Pi run.');
          await api.commit(async (tx) => {
            const failures = await tx.doc(PiToolBudget, api.conversationId);
            if (failures.inputId !== inputs[0]!.record.id) {
              failures.inputId = inputs[0]!.record.id;
              failures.failedGroups = [];
            }
            if (!failures.failedGroups.includes(tool.failureGroup!))
              failures.failedGroups.push(tool.failureGroup!);
          }, context);
        }
        if (!result.artifacts.length) return;
        const identity = await this.taskIdentity(lane, api, context);
        await this.requirePorts().admitArtifacts(
          identity,
          result.artifacts,
          requireSignal(context),
        );
        await this.requireRuntime().grantFiles(
          key,
          result.artifacts.map((artifact) => artifact.ref.fileEntryId),
          context,
        );
      },
    });
    this.registry.install({
      ...extension,
      sections: [
        section(
          'cherry-runtime',
          () => `${configuration.instructions}${webInstructions(configuration.webTools, routes)}`,
          { tag: false },
        ),
        ...(extension.sections ?? []),
        CURRENT_DATE_SECTION,
      ],
      hooks: [
        ...(extension.hooks ?? []),
        hook(GenerationTask, {
          beforeRequest: async (_request, api, context) => {
            // The harness derives this context from the same invocation signal it forwards to Models.
            const signal = requireSignal(context);
            this.requestOwners.set(signal, await this.taskIdentity(lane, api, context));
            this.webRequests.delete(signal);
            if (nativeWeb && !(await this.webLookupFailed(key, api, context)))
              this.webRequests.set(signal, routes);
          },
        }),
      ],
    });
    this.configurations.set(key, configuration);
    return {
      model: {
        provider: configuration.model.providerId,
        modelId: piDurableModelKey(configuration.model, configuration.kind),
      },
      // The reserved instructions section renders last; the extension keeps fixed rules first.
      instructions: null,
      extensions: [extension],
    };
  }

  /** The route is chosen once per configuration and stored with it, never re-derived on recovery. */
  private async configurationBlueprint(input: RuntimeConversationConfiguration) {
    const native =
      input.webTools && input.kind !== 'image'
        ? await this.dependencies
            .nativeWebTools?.(input.model, input.options)
            .catch(() => undefined)
        : undefined;
    return PiConfigurationSchema.parse({
      ...input,
      version: 2,
      tools: input.tools.map(piToolBlueprint),
      ...(input.webTools
        ? { webRoutes: resolvePiWebToolRoutes(input.webTools, native, input.tools) }
        : {}),
    });
  }

  private async webLookupFailed(key: string, api: HookApi, context: Context) {
    const inputs = await this.requireRuntime().inputsForTask(api, context);
    return failedPiToolGroups(
      await this.requireRuntime().turnEntries(key, inputs[0]!.record, context),
    ).includes(PI_WEB_FAILURE_GROUP);
  }

  private toolTemplate(blueprint: PiStoredConfiguration['tools'][number]): RuntimeTool {
    return {
      ...blueprint,
      execute: async () => {
        throw new Error(
          'A tool template must resolve the current durable invocation before execution.',
        );
      },
    };
  }

  private async taskIdentity(
    lane: RuntimeLane,
    api: HookApi,
    context: Context,
  ): Promise<RuntimeExecutionIdentity> {
    const inputs = await this.requireRuntime().inputsForTask(api, context);
    if (inputs.length !== 1)
      throw new Error('Cherry capabilities require one owning input per Pi run.');
    const stored = readPiSubmission(inputs[0]!.metadata);
    return { ...lane, turnId: stored.turnId, requestId: stored.requestId };
  }

  private async bindProvider(lane: RuntimeLane) {
    const providerId = await this.requireRuntime().providerSessionId(laneKey(lane));
    if (!providerId) throw new Error('A Pi conversation has no provider affinity.');
    this.providerOwners.set(providerId, lane);
  }

  private executionOwner(
    providerId: string | undefined,
    signal: AbortSignal | undefined,
  ): RuntimeUsageOwner {
    const lane = providerId ? this.providerOwners.get(providerId) : undefined;
    if (!lane) throw new Error('A provider request has no business conversation owner.');
    const owner = signal ? this.requestOwners.get(signal) : undefined;
    if (owner && !sameLane(owner, lane))
      throw new Error('The model invocation belongs to a different conversation.');
    // Compaction (including a recovered summarize phase) is session work, never a future input.
    return owner ?? { ...lane, turnId: null, requestId: null };
  }

  private async grantInputFiles(lane: RuntimeLane) {
    const runtime = this.requireRuntime();
    const key = laneKey(lane);
    const ids: string[] = [];
    for (const input of await runtime.liveInputs(key)) {
      const files = readPiSubmission(input.metadata).metadata.referencedFileEntryIds;
      if (Array.isArray(files)) for (const id of files) if (typeof id === 'string') ids.push(id);
    }
    await runtime.grantFiles(key, ids);
  }

  private async deliverUsage() {
    for (const delivery of await this.requireRuntime().pendingUsage()) {
      // This private document contains only values produced by our model bridge.
      // Receipts written before working-copy slots name no slot: they ran on the first copy.
      const value = delivery.value as unknown as {
        owner: Omit<RuntimeUsageOwner, 'slot'> & { slot?: number };
        report: RuntimeUsageReport;
      };
      if (!value.owner?.sessionId || value.report?.requestId !== delivery.id)
        throw new Error('The durable usage receipt has an invalid identity.');
      await this.requirePorts().recordUsage(
        { ...value.owner, slot: value.owner.slot ?? 0 } as RuntimeUsageOwner,
        value.report,
      );
      await this.requireRuntime().acknowledgeUsage(delivery.id);
    }
  }

  private requireConfiguration(key: string) {
    const value = this.configurations.get(key);
    if (!value)
      throw new Error('The durable conversation configuration has not been reconstructed.');
    return value;
  }
  private requireModel(configuration: PiStoredConfiguration): Model<Api> {
    const model = this.models.getModel(configuration.model, configuration.kind);
    if (!model) throw new Error('The configured Pi model is missing.');
    return model;
  }
  private requireRuntime() {
    if (!this.runtime) throw new Error('The durable Agent runtime is not initialized.');
    return this.runtime;
  }
  private requirePorts() {
    if (!this.ports) throw new Error('The durable Agent execution ports are missing.');
    return this.ports;
  }
}

/** The Host writes its web guidance for the external tools; the selected route may differ. */
function webInstructions(policy: PiStoredConfiguration['webTools'], routes: PiWebToolRoutes) {
  if (!policy) return '';
  if (routes.search === 'none' && routes.fetch === 'none')
    return '\n\nLive web search and page retrieval are unavailable for this turn. Explain this when current sources are needed; do not claim to have searched or fetched a page.';
  if (routes.search === 'server' || routes.fetch === 'server')
    return "\n\nSome web lookups in this conversation run on the model provider's built-in tool. Its results carry no citation ids: never invent one for them. Their sources are attached to the answer automatically.";
  return '';
}

function parseBoundary(value: string): EntryId {
  if (!/^pi:\d+$/.test(value)) throw new Error('Invalid Pi history boundary.');
  const id = Number(value.slice(3));
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('Invalid Pi history boundary.');
  return id as EntryId;
}

function requireSignal(context: Context) {
  if (!context.abortSignal) throw new Error('The durable invocation has no cancellation owner.');
  return context.abortSignal;
}
