import type { Context } from '@earendil-works/chord';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Api, Model, Message } from '@earendil-works/pi-ai';
import {
  createRegistry,
  GenerationTask,
  hook,
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
import { SqliteStorage } from '@earendil-works/pi-durable/storage/sqlite';

import type {
  DurableAgentRuntime,
  RuntimeConversationConfiguration,
  RuntimeConversationEvent,
  RuntimeConversationSeed,
  RuntimeDurableSubmission,
  RuntimeDurableTurn,
  RuntimeExecutionIdentity,
  RuntimeExecutionPorts,
  RuntimeSqlDatabase,
  RuntimeUsageOwner,
} from '../durableTypes';
import type { RuntimeDescriptor, RuntimeTool, RuntimeUsageReport } from '../types';
import { toPiConversation } from './modelMessages';
import { createPiDurableModels, piDurableModelKey } from './piDurableModels';
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
import { PiDurableRuntime } from './PiDurableRuntime';
import { createPiDurableToolExtension } from './piDurableTools';
import type { PiRuntimeDependencies } from './piModelTypes';
import {
  PI_TOOL_BUDGET_FINAL_RESPONSE,
  PiToolBudgetExceededError,
  piToolBudgetState,
} from './piToolBudget';
import { createPiTurnReplay } from './piTurnReplay';
import { createPiContextCheckpoint, createWorkingPiEntries } from './piWorkingHistory';

const DESCRIPTOR: RuntimeDescriptor = {
  id: 'pi-durable',
  name: 'Pi Durable',
  capabilities: { reasoning: true, tools: true, approvals: true, attachments: true },
};

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
  private readonly configurations = new Map<string, PiStoredConfiguration>();
  private readonly providerOwners = new Map<string, string>();
  private readonly requestOwners = new WeakMap<AbortSignal, RuntimeExecutionIdentity>();
  /** Requests after an exhausted tool budget, which must not select tools. */
  private readonly toolFreeRequests = new WeakSet<AbortSignal>();
  private readonly observers = new Set<PiDurableObserver>();
  private delivery: Promise<void> = Promise.resolve();
  private readonly models: ReturnType<typeof createPiDurableModels>;

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
          const selected = await this.requireRuntime().inputRecord(
            owner.sessionId,
            owner.requestId,
          );
          if (!selected) throw new Error('The model request has no durable input.');
          await this.grantInputFiles(owner.sessionId);
        }
        signal.throwIfAborted();
        return this.requireRuntime().requestOptions(providerId);
      },
      async (providerId, signal) => {
        const owner = this.executionOwner(providerId, signal);
        return async (report) => {
          await this.requireRuntime().saveUsage(report.requestId, detachedJson({ owner, report }));
          // Delivery failure retains the outbox record. It must not cause the model to resend an answer.
          this.delivery = this.delivery.then(() => this.deliverUsage()).catch(() => undefined);
        };
      },
      (providerId, signal) =>
        Promise.resolve(this.requirePorts().traceModel?.(this.executionOwner(providerId, signal))),
      (signal) => signal !== undefined && this.toolFreeRequests.has(signal),
    );
  }

  preflightModel(model: RuntimeConversationConfiguration['model']) {
    return Promise.resolve(this.dependencies.preflightModel(model));
  }

  async initialize(database: RuntimeSqlDatabase, ports: RuntimeExecutionPorts): Promise<void> {
    if (this.runtime) throw new Error('The durable Agent runtime is already initialized.');
    this.ports = ports;
    let storage: Storage | undefined;
    try {
      storage = await this.createStorage(database);
      this.runtime = await PiDurableRuntime.open(storage, {
        models: this.models.models,
        registry: this.registry,
        settings: { followUpMode: 'one-at-a-time' },
      });
      // Stored history needs no registry code. Rebuild only unfinished owners before any resume.
      for (const sessionId of await this.unfinishedSessions()) {
        const configuration = PiConfigurationSchema.parse(
          await this.runtime.configuration(sessionId),
        );
        await this.installConfiguration(sessionId, configuration, true);
        await this.bindProvider(sessionId);
      }
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
        this.runtime = undefined;
        this.ports = undefined;
        this.configurations.clear();
        this.providerOwners.clear();
      }
      throw error;
    }
  }

  resume(): void {
    this.delivery = this.delivery.then(() => this.deliverUsage()).catch(() => undefined);
    this.requireRuntime().resume();
  }

  async watchWork(listener: (active: boolean) => void) {
    const watch = await this.requireRuntime().watchWork();
    const active = Object.keys(watch.value.tasks).length > 0;
    watch.start(async (value) => listener(Object.keys(value.tasks).length > 0));
    return {
      active,
      unsubscribe: async () => {
        await watch.stop();
      },
    };
  }

  async close(): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) return;
    await Promise.all([...this.observers].map((observer) => observer.stop()));
    await this.delivery;
    try {
      await runtime.close();
    } finally {
      this.runtime = undefined;
      this.ports = undefined;
      this.configurations.clear();
      this.providerOwners.clear();
      this.observers.clear();
      for (const extension of this.registry.snapshot().installed())
        this.registry.uninstall(extension);
    }
  }

  async sessions() {
    return (await this.requireRuntime().sessions()).map(({ sessionId, binding }) => ({
      sessionId,
      revision: binding.revision,
    }));
  }

  async hasConversation(sessionId: string) {
    return (await this.requireRuntime().conversation(sessionId)) !== undefined;
  }

  async revision(sessionId: string) {
    return (await this.requireRuntime().binding(sessionId))?.revision;
  }

  async unfinishedSessions() {
    const runtime = this.requireRuntime();
    const inspection = await runtime.inspect();
    const conversations = new Set([
      ...inspection.tasks.map((task) => task.record.conversationId),
      ...inspection.submissions.map((submission) => submission.conversationId),
    ]);
    return (await runtime.sessions())
      .filter(
        ({ binding }) =>
          binding.conversationId !== null && conversations.has(binding.conversationId),
      )
      .map(({ sessionId }) => sessionId);
  }

  async configuration(sessionId: string): Promise<RuntimeConversationConfiguration> {
    const stored =
      this.configurations.get(sessionId) ??
      PiConfigurationSchema.parse(await this.requireRuntime().configuration(sessionId));
    return {
      kind: stored.kind,
      model: { ...stored.model },
      instructions: stored.instructions,
      options: { ...stored.options },
      tools: stored.tools.map((tool) => this.toolTemplate(tool)),
    };
  }

  resourceFileEntryIds(sessionId: string) {
    return this.requireRuntime().resourceFileEntryIds(sessionId);
  }

  async ensureConversation(seed: RuntimeConversationSeed, signal?: AbortSignal): Promise<void> {
    const runtime = this.requireRuntime();
    if (await runtime.conversation(seed.sessionId)) {
      if ((await runtime.binding(seed.sessionId))?.revision !== seed.revision)
        throw new Error('The working copy is obsolete.');
      return;
    }
    const configuration = configurationBlueprint(seed.configuration);
    const agent = await this.installConfiguration(seed.sessionId, configuration);
    const model = this.requireModel(configuration);
    const originalEntries = seed.history
      ? createWorkingPiEntries(
          {
            turnId: 'history-import',
            sessionId: seed.sessionId,
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
    await runtime.ensureConversation({
      sessionId: seed.sessionId,
      revision: seed.revision,
      agent,
      options: configuration.options,
      configuration: detachedJson(configuration),
      resourceFileEntryIds: seed.history?.referencedFileEntryIds ?? [],
      entries: originalEntries,
    });
    await this.bindProvider(seed.sessionId);
  }

  async configure(sessionId: string, input: RuntimeConversationConfiguration): Promise<void> {
    const previous = this.configurations.get(sessionId);
    const configuration = configurationBlueprint(input);
    const agent = await this.installConfiguration(sessionId, configuration);
    try {
      await this.requireRuntime().configure(
        sessionId,
        agent,
        configuration.options,
        BACKGROUND_CONTEXT,
        detachedJson(configuration),
      );
      await this.bindProvider(sessionId);
    } catch (error) {
      if (previous) await this.installConfiguration(sessionId, previous);
      throw error;
    }
  }

  async submit(sessionId: string, input: RuntimeDurableSubmission): Promise<RuntimeDurableTurn> {
    const runtime = this.requireRuntime();
    const configuration = this.requireConfiguration(sessionId);
    const model = this.requireModel(configuration);
    const tools = configuration.tools.map((blueprint) => this.toolTemplate(blueprint));
    const assembled = toPiConversation(
      {
        turnId: input.turnId,
        sessionId,
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
      sessionId,
      { type: 'input', requestId: input.requestId, content: prompt.content, whenBusy: 'followUp' },
      {
        ...piSubmissionMetadata(input, tools),
        ...(assembled.resume?.length
          ? { replayPrefix: detachedJson({ messages: assembled.resume }).messages! }
          : {}),
      },
      { userMessageId: input.userMessageId, assistantMessageId: input.assistantMessageId },
    );
    const record = await submission.status(BACKGROUND_CONTEXT);
    return this.project(sessionId, record, await runtime.submissionMetadata(record));
  }

  async observe(sessionId: string, listener: (event: RuntimeConversationEvent) => void) {
    const runtime = this.requireRuntime();
    const observer = new PiDurableObserver(runtime, sessionId, listener);
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
    sessionId: string,
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
        sessionId,
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
        turns.push(await this.project(sessionId, record, metadata));
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

  async message(sessionId: string, messageId: string) {
    const runtime = this.requireRuntime();
    const selected = await runtime.submissionForMessage(sessionId, messageId);
    if (!selected) return undefined;
    const turn = await this.project(sessionId, selected.record, selected.metadata);
    if (selected.role === 'assistant' && !turn.hasAssistant) return undefined;
    return { turn, role: selected.role };
  }

  async exportTurn(
    sessionId: string,
    requestId: string,
    options: { currentContext?: boolean } = {},
  ) {
    const runtime = this.requireRuntime();
    const record = await runtime.inputRecord(sessionId, requestId);
    if (!record || record.type !== 'input' || record.status !== 'done')
      return { replay: null, contextCheckpoint: null };
    const stored = readPiSubmission(await runtime.submissionMetadata(record));
    const entries = await runtime.turnEntries(sessionId, record);
    const messages = entries
      .flatMap((entry) => entry.model ?? [])
      .filter((message) => message.role === 'assistant' || message.role === 'toolResult');
    const replay =
      createPiTurnReplay([...((stored.replayPrefix as unknown as Message[]) ?? []), ...messages]) ??
      null;
    const conversation = await runtime.conversation(sessionId);
    if (!conversation) throw new Error('The working copy is missing.');
    const view = await conversation.context(
      BACKGROUND_CONTEXT,
      options.currentContext ? {} : { at: record.answer },
    );
    const contextCheckpoint =
      view.head && (CompactionEntry.is(view.head) || ResetEntry.is(view.head))
        ? createPiContextCheckpoint(stored.turnId, view.messages)
        : null;
    return { replay, contextCheckpoint };
  }

  async abort(sessionId: string) {
    await this.requireRuntime().stop(sessionId);
  }

  async discardConversation(sessionId: string) {
    const runtime = this.requireRuntime();
    if (!(await runtime.conversation(sessionId))) return;
    await runtime.stop(sessionId);
    await this.drainUsage();
    await runtime.retireSession(sessionId);
    this.configurations.delete(sessionId);
    for (const [providerId, owner] of this.providerOwners)
      if (owner === sessionId) this.providerOwners.delete(providerId);
    const name = `cherry.capabilities:${sessionId}`;
    for (const extension of this.registry.snapshot().installed())
      if (extension.name === name) this.registry.uninstall(extension);
  }
  async withdraw(sessionId: string, requestId: string) {
    const result = await this.requireRuntime().withdrawInput(sessionId, requestId);
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
    sessionId: string,
    record: SubmissionRecord,
    metadata: JsonObject | undefined,
  ) {
    const runtime = this.requireRuntime();
    const conversation = await runtime.conversation(sessionId);
    if (!conversation) throw new Error('The Pi conversation is missing.');
    const active = record.conversationId === conversation.id && record.status === 'placed';
    return projectPiTurn({
      sessionId,
      record,
      metadata,
      entries: await runtime.turnEntries(sessionId, record),
      active,
      inherited: record.conversationId !== conversation.id,
    });
  }

  private async installConfiguration(
    sessionId: string,
    configuration: PiStoredConfiguration,
    rehydrating = false,
  ): Promise<AgentChange> {
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
    const extension = createPiDurableToolExtension({
      name: `cherry.capabilities:${sessionId}`,
      tools: configuration.tools.map((blueprint) => this.toolTemplate(blueprint)),
      previousFailures: async (api, context) => {
        const inputs = await this.requireRuntime().inputsForTask(api, context);
        return inputs[0]
          ? failedPiToolGroups(
              await this.requireRuntime().turnEntries(sessionId, inputs[0].record, context),
            )
          : [];
      },
      beforeCall: async (call, api, context) => {
        const inputs = await this.requireRuntime().inputsForTask(api, context);
        if (inputs.length !== 1) return 'This tool has no unambiguous owning input.';
        const entries = await this.requireRuntime().turnEntries(
          sessionId,
          inputs[0]!.record,
          context,
        );
        const calls = entries
          .flatMap((entry) => entry.model ?? [])
          .flatMap((message) =>
            message.role === 'assistant'
              ? message.content.filter((part) => part.type === 'toolCall')
              : [],
          );
        const index = calls.findIndex((part) => part.id === call.id);
        return index < 0 || index >= 64 ? 'The turn exceeded its 64 tool-call budget.' : undefined;
      },
      resolve: async (template, api, context) => {
        const identity = await this.taskIdentity(sessionId, api, context);
        const signal = requireSignal(context);
        await this.requirePorts().assertExecutionAllowed(identity, signal);
        return {
          tool: await this.requirePorts().resolveTool(identity, template.ref, signal),
          turnId: identity.turnId,
        };
      },
      approve: async (tool, input, call, api, context) => {
        const identity = await this.taskIdentity(sessionId, api, context);
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
      onResult: async (_tool, result, api, context) => {
        if (!result.artifacts.length) return;
        const identity = await this.taskIdentity(sessionId, api, context);
        await this.requirePorts().admitArtifacts(
          identity,
          result.artifacts,
          requireSignal(context),
        );
        await this.requireRuntime().grantFiles(
          sessionId,
          result.artifacts.map((artifact) => artifact.ref.fileEntryId),
          context,
        );
      },
    });
    this.registry.install({
      ...extension,
      hooks: [
        ...(extension.hooks ?? []),
        hook(GenerationTask, {
          beforeRequest: async (request, api, context) => {
            // The harness derives this context from the same invocation signal it forwards to Models.
            const signal = requireSignal(context);
            this.requestOwners.set(signal, await this.taskIdentity(sessionId, api, context));
            const budget = piToolBudgetState(request.messages);
            if (budget === 'exceeded') throw new PiToolBudgetExceededError();
            if (budget === 'available') {
              this.toolFreeRequests.delete(signal);
              return undefined;
            }
            this.toolFreeRequests.add(signal);
            return {
              messages: [
                ...request.messages,
                { ...PI_TOOL_BUDGET_FINAL_RESPONSE, timestamp: Date.now() },
              ],
            };
          },
        }),
      ],
    });
    this.configurations.set(sessionId, configuration);
    return {
      model: {
        provider: configuration.model.providerId,
        modelId: piDurableModelKey(configuration.model, configuration.kind),
      },
      instructions: configuration.instructions,
      extensions: [extension],
    };
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
    sessionId: string,
    api: HookApi,
    context: Context,
  ): Promise<RuntimeExecutionIdentity> {
    const inputs = await this.requireRuntime().inputsForTask(api, context);
    if (inputs.length !== 1)
      throw new Error('Cherry capabilities require one owning input per Pi run.');
    const stored = readPiSubmission(inputs[0]!.metadata);
    return { sessionId, turnId: stored.turnId, requestId: stored.requestId };
  }

  private async bindProvider(sessionId: string) {
    const providerId = await this.requireRuntime().providerSessionId(sessionId);
    if (!providerId) throw new Error('A Pi conversation has no provider affinity.');
    this.providerOwners.set(providerId, sessionId);
  }

  private executionOwner(
    providerId: string | undefined,
    signal: AbortSignal | undefined,
  ): RuntimeUsageOwner {
    const sessionId = providerId ? this.providerOwners.get(providerId) : undefined;
    if (!sessionId) throw new Error('A provider request has no business conversation owner.');
    const owner = signal ? this.requestOwners.get(signal) : undefined;
    if (owner && owner.sessionId !== sessionId)
      throw new Error('The model invocation belongs to a different conversation.');
    // Compaction (including a recovered summarize phase) is session work, never a future input.
    return owner ?? { sessionId, turnId: null, requestId: null };
  }

  private async grantInputFiles(sessionId: string) {
    const runtime = this.requireRuntime();
    const ids: string[] = [];
    for (const input of await runtime.liveInputs(sessionId)) {
      const files = readPiSubmission(input.metadata).metadata.referencedFileEntryIds;
      if (Array.isArray(files)) for (const id of files) if (typeof id === 'string') ids.push(id);
    }
    await runtime.grantFiles(sessionId, ids);
  }

  private async deliverUsage() {
    for (const delivery of await this.requireRuntime().pendingUsage()) {
      // This private document contains only values produced by our model bridge.
      const value = delivery.value as unknown as {
        owner: RuntimeUsageOwner;
        report: RuntimeUsageReport;
      };
      if (!value.owner?.sessionId || value.report?.requestId !== delivery.id)
        throw new Error('The durable usage receipt has an invalid identity.');
      await this.requirePorts().recordUsage(value.owner, value.report);
      await this.requireRuntime().acknowledgeUsage(delivery.id);
    }
  }

  private requireConfiguration(sessionId: string) {
    const value = this.configurations.get(sessionId);
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

function configurationBlueprint(input: RuntimeConversationConfiguration) {
  return PiConfigurationSchema.parse({
    ...input,
    version: 1,
    tools: input.tools.map(piToolBlueprint),
  });
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
