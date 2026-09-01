import type {
  AgentMessageView,
  AgentSessionView,
  AgentSubmitMessageInput,
} from '@/shared/contracts/agent';
import { FileEntryIdSchema, type FileEntryId } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { ManagedFileFact, ManagedFileResolver } from '../../resources/managedFileResolver';
import { FakeRuntime, type RuntimeModel, type RuntimeTool } from '../../runtime';
import type {
  StoredRuntimeContextCheckpoint,
  StoredRuntimeTurnContext,
} from '../../sessionStore/AgentSessionStore';
import type { AgentDefinition } from '../agentDefinitions';
import type { AgentInferenceModelSnapshot } from '../inferenceSnapshot';
import {
  prepareInitialTurn,
  prepareTurn,
  type TurnPreparationDependencies,
} from '../turnPreparation';

const AGENT_ID = 'agent-1';
const SESSION_ID = 'session-1';
const FILE_ENTRY_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
const NOW = '2026-01-01T00:00:00.000Z';

const BASE_MODEL: RuntimeModel = { providerId: 'provider-1', modelId: 'model-1' };
const OVERRIDE_MODEL: RuntimeModel = { providerId: 'provider-2', modelId: 'model-2' };

const SESSION: AgentSessionView = {
  id: SESSION_ID,
  agentId: AGENT_ID,
  executionTarget: { kind: 'local' },
  title: '',
  titleIsManual: false,
  forkedFromSessionId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const AGENT: AgentDefinition = {
  id: AGENT_ID,
  name: 'Planner Agent',
  instructions: 'Plan carefully.',
  model: BASE_MODEL,
  options: { maxOutputTokens: 512, reasoningEffort: 'low', temperature: 0.2 },
  toolApprovalMode: 'auto',
  disabledCapabilities: ['health'],
};

const EMPTY_CONTEXT: StoredRuntimeTurnContext = {
  anchorFound: true,
  hasMessages: false,
  history: [],
  referencedFileEntryIds: [],
  sessionTurnIds: [],
};

describe('turn preparation', () => {
  test('prepares a Draft first turn without reading a durable Session', async () => {
    const harness = createHarness();

    const plan = await prepareInitialTurn(
      harness.dependencies,
      {
        agentId: AGENT_ID,
        executionTarget: { kind: 'local' },
        parts: [{ text: 'Hello.', type: 'text' }],
      },
      new AbortController().signal,
    );

    expect(plan.hasMessages).toBe(false);
    expect(plan.history).toEqual([]);
    expect(plan.sessionTurnIds).toEqual([]);
    expect(harness.getSession).not.toHaveBeenCalled();
    expect(harness.getLatestContextCheckpoint).not.toHaveBeenCalled();
    expect(harness.loadRuntimeTurnContext).not.toHaveBeenCalled();
  });

  test('builds a canonical turn plan from frozen model, tool, and attachment facts', async () => {
    const harness = createHarness();
    const input: AgentSubmitMessageInput = {
      sessionId: SESSION_ID,
      parts: [
        { type: 'text', text: 'Review this file.' },
        {
          type: 'file',
          fileEntryId: FILE_ENTRY_ID,
          mediaType: 'text/plain',
        },
      ],
      modelId: createUniqueModelId(OVERRIDE_MODEL.providerId, OVERRIDE_MODEL.modelId),
      reasoningEffort: 'default',
    };

    const plan = await prepareTurn(harness.dependencies, input, new AbortController().signal);

    expect(harness.routeExecutionTarget).toHaveBeenCalledWith(SESSION.executionTarget);
    expect(harness.getSystemTools).toHaveBeenCalledWith({
      disabledCapabilities: AGENT.disabledCapabilities,
      model: OVERRIDE_MODEL,
      resources: plan.resources,
    });
    expect(harness.resolveRuntimeTools).toHaveBeenCalledWith(AGENT_ID);
    expect(harness.resolveInferenceModel).toHaveBeenCalledWith(OVERRIDE_MODEL);
    expect(harness.preflightModel).toHaveBeenCalledWith(OVERRIDE_MODEL);

    expect(plan.agent).toEqual({
      ...AGENT,
      model: OVERRIDE_MODEL,
      options: { maxOutputTokens: 512, temperature: 0.2 },
    });
    expect(plan.inputParts).toEqual([
      { type: 'text', text: 'Review this file.' },
      {
        type: 'file',
        fileEntryId: FILE_ENTRY_ID,
        mediaType: 'text/plain',
        name: 'notes.txt',
      },
    ]);
    expect(plan.userParts).toEqual([
      { id: 'input-0', type: 'text', text: 'Review this file.', state: 'done' },
      {
        id: 'input-1',
        type: 'file',
        fileEntryId: FILE_ENTRY_ID,
        mediaType: 'text/plain',
        name: 'notes.txt',
        purpose: 'input-attachment',
      },
    ]);
    expect(plan.runtimeTextAttachments.get(FILE_ENTRY_ID)).toEqual({
      fileEntryId: FILE_ENTRY_ID,
      type: 'text-attachment',
      mediaType: 'text/plain',
      name: 'notes.txt',
      text: 'trusted only as user input',
      truncated: false,
      trust: 'untrusted-user-content',
    });
    expect(plan.tools.map((tool) => tool.approval)).toEqual(['auto', 'deny']);
    expect(harness.systemTool.approval).toBe('ask');
    expect(harness.configuredTool.approval).toBe('deny');
    expect(plan.inferenceSnapshot).toMatchObject({
      version: 1,
      model: {
        uniqueModelId: createUniqueModelId(OVERRIDE_MODEL.providerId, OVERRIDE_MODEL.modelId),
      },
      parameters: { maxOutputTokens: 512, temperature: 0.2 },
      tools: [{ approval: 'auto' }, { approval: 'deny' }],
    });
    expect(plan.hasMessages).toBe(false);
    expect(plan.runtimeContextCheckpoint).toBeNull();
    expect(plan.sessionTurnIds).toEqual([]);
  });

  test('keeps an auto-ineligible ask unchanged under the auto approval mode', async () => {
    const harness = createHarness();
    harness.getSystemTools.mockResolvedValueOnce([
      { ...harness.systemTool, autoApprovalEligible: false },
    ]);

    const plan = await prepareTurn(harness.dependencies, textInput(), new AbortController().signal);

    // The Agent runs in auto mode, but a consent-bearing ask must survive it.
    expect(plan.tools.map((tool) => tool.approval)).toEqual(['ask', 'deny']);
  });

  test('stops at session admission when the session does not exist', async () => {
    const harness = createHarness();
    harness.getSession.mockResolvedValueOnce(null);

    await expect(
      prepareTurn(harness.dependencies, textInput(), new AbortController().signal),
    ).rejects.toMatchObject({ view: { code: 'SESSION_NOT_FOUND' } });

    expect(harness.getAgent).not.toHaveBeenCalled();
    expect(harness.routeExecutionTarget).not.toHaveBeenCalled();
    expect(harness.getLatestContextCheckpoint).not.toHaveBeenCalled();
  });

  test('fails closed when configured tool bindings cannot be resolved', async () => {
    const harness = createHarness();
    harness.resolveRuntimeTools.mockRejectedValueOnce(new Error('private MCP failure'));

    await expect(
      prepareTurn(harness.dependencies, textInput(), new AbortController().signal),
    ).rejects.toMatchObject({
      view: {
        code: 'EXECUTION_UNAVAILABLE',
        message: 'The configured Agent tools are unavailable.',
      },
    });

    expect(harness.resolveInferenceModel).not.toHaveBeenCalled();
    expect(harness.preflightModel).not.toHaveBeenCalled();
  });

  test('replays full history when a valid checkpoint anchor is no longer present', async () => {
    const harness = createHarness();
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: 'turn-anchor',
      payload: { summary: 'Earlier context.' },
    };
    const history = [textMessage('message-after-anchor', 'turn-later')];
    harness.getLatestContextCheckpoint.mockResolvedValueOnce({
      assistantMessageId: 'assistant-anchor',
      checkpoint,
    });
    harness.loadRuntimeTurnContext.mockResolvedValueOnce({
      anchorFound: false,
      hasMessages: true,
      history,
      referencedFileEntryIds: [],
      sessionTurnIds: ['turn-later'],
    });

    const plan = await prepareTurn(harness.dependencies, textInput(), new AbortController().signal);

    expect(harness.loadRuntimeTurnContext).toHaveBeenCalledWith(SESSION_ID, 'turn-anchor');
    expect(plan.runtimeContextCheckpoint).toBeNull();
    expect(plan.history).toEqual(history);
    expect(plan.hasMessages).toBe(true);
    expect(plan.sessionTurnIds).toEqual(['turn-later']);
  });
});

function createHarness() {
  const textFact = fact(FILE_ENTRY_ID, 'notes.txt', 'text/plain', 26);
  const getSession = jest.fn(
    async (_sessionId: string): Promise<AgentSessionView | null> => SESSION,
  );
  const getAgent = jest.fn(async (_agentId: string): Promise<AgentDefinition | null> => AGENT);
  const getLatestContextCheckpoint = jest.fn(
    async (_sessionId: string): Promise<StoredRuntimeContextCheckpoint | null> => null,
  );
  const loadRuntimeTurnContext = jest.fn(
    async (_sessionId: string, _anchorTurnId: string | null): Promise<StoredRuntimeTurnContext> =>
      EMPTY_CONTEXT,
  );
  const resolveAvailable = jest.fn(async (fileEntryIds: readonly FileEntryId[]) =>
    fileEntryIds.includes(FILE_ENTRY_ID) ? new Map([[FILE_ENTRY_ID, textFact]]) : new Map(),
  );
  const readAsBytes = jest.fn(async () => new TextEncoder().encode('trusted only as user input'));
  const files: ManagedFileResolver = {
    resolveAvailable,
    readAsBytes,
    readAsDataUrl: jest.fn(async () => undefined),
  };
  const systemTool = tool('system_tool', 'ask');
  const configuredTool = tool('configured_tool', 'deny');
  const getSystemTools = jest.fn(async () => [systemTool]);
  const resolveRuntimeTools = jest.fn(async (_agentId: string) => [configuredTool]);
  const resolveInferenceModel = jest.fn(
    async (model: RuntimeModel): Promise<AgentInferenceModelSnapshot> => ({
      uniqueModelId: createUniqueModelId(model.providerId, model.modelId),
      providerId: model.providerId,
      modelId: model.modelId,
      apiModelId: `${model.modelId}-api`,
      name: 'Selected Model',
    }),
  );
  const runtime = new FakeRuntime({
    modelPreflight: {
      contextWindow: 128_000,
      inputModalities: ['text', 'image'],
      maxInputTokens: 120_000,
      maxOutputTokens: 8_000,
      supportsTools: true,
    },
  });
  const preflightModel = jest.spyOn(runtime, 'preflightModel');
  const routeExecutionTarget = jest.fn(() => runtime);
  const dependencies: TurnPreparationDependencies = {
    agents: { getAgent },
    files,
    inferenceModel: resolveInferenceModel,
    routeExecutionTarget,
    runtimeTools: { resolve: resolveRuntimeTools },
    store: { getLatestContextCheckpoint, getSession, loadRuntimeTurnContext },
    systemCapabilities: { getTools: getSystemTools },
  };

  return {
    configuredTool,
    dependencies,
    getAgent,
    getLatestContextCheckpoint,
    getSession,
    getSystemTools,
    loadRuntimeTurnContext,
    preflightModel,
    resolveInferenceModel,
    resolveRuntimeTools,
    routeExecutionTarget,
    systemTool,
  };
}

function textInput(): AgentSubmitMessageInput {
  return { sessionId: SESSION_ID, parts: [{ type: 'text', text: 'Continue.' }] };
}

function fact(
  fileEntryId: FileEntryId,
  name: string,
  mediaType: string,
  size: number,
): ManagedFileFact {
  return { fileEntryId, mediaType, name, size };
}

function tool(providerName: string, approval: RuntimeTool['approval']): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: providerName },
    providerName,
    displayName: providerName,
    description: `${providerName} description`,
    inputSchema: { type: 'object' },
    approval,
    execute: async () => ({ value: null, artifacts: [] }),
  };
}

function textMessage(id: string, turnId: string): AgentMessageView {
  return {
    id,
    sessionId: SESSION_ID,
    turnId,
    role: 'user',
    status: 'success',
    parts: [{ id: `${id}-part`, type: 'text', text: 'Later message.', state: 'done' }],
    usage: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
