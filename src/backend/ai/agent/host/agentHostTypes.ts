import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';
import type { LanguageVarious } from '@/shared/data/preference';

import type { TraceRecorder } from '../../observability';
import type { ManagedFileResolver } from '../resources/managedFileResolver';
import type {
  RuntimeSqlDatabase,
  RuntimeExecutionPorts,
  RuntimeScriptSandbox,
  RuntimeUsageOwner,
  RuntimeUsageReport,
  RuntimeWebTools,
} from '../runtime';
import type { SystemCapabilitySource } from '../tools/builtInToolSource';
import type { AgentRuntimeToolResolver } from '../tools/runtimeTools';
import type { AgentDefinitionSource } from './agentDefinitions';
import type { AgentImageGenerationPort } from './agentImageGeneration';
import type { AgentSessionNaming } from './AgentSessionNaming';
import type { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import type { AgentInferenceModelResolver } from './inferenceSnapshot';
import type { SkillScopeSource } from './skillScope';

export type MobileAgentHostNaming = Pick<
  AgentSessionNaming,
  'drain' | 'maybeRenameFromConversationSummary' | 'maybeRenameFromFirstUserMessage'
>;

/**
 * Everything the Host needs from the application, as narrow ports. Production
 * assembles them in `AgentHostDependencies`; tests hand in fakes. The Host
 * never constructs a collaborator itself.
 */
export type MobileAgentHostPorts = {
  scriptSandbox?(): RuntimeScriptSandbox | undefined;
  writeToolOutput?(
    /** `folderId` is the turn's workspace; outputs land beside the Agent's other writes. */
    output: { name: string; data: string | Uint8Array; folderId: string | null },
    signal: AbortSignal,
  ): ReturnType<NonNullable<RuntimeExecutionPorts['writeToolOutput']>>;
  executionLease?(onInterrupt: (reason: Error) => void | Promise<void>): { release(): void };
  /** Supplied by data composition; the Host never imports SQLite or Pi storage. */
  durableStorage?: {
    open(): Promise<RuntimeSqlDatabase>;
    notifyTranscript(sessionId: string): void;
  };
  /** Throwing, idempotent delivery. Pi retains a receipt until this writer succeeds. */
  recordDurableUsage?(
    owner: RuntimeUsageOwner,
    report: RuntimeUsageReport,
    attribution: {
      agentId: string;
      agentName: string | null;
      assistantMessageId: string | null;
    },
  ): Promise<void>;
  agents: AgentDefinitionSource;
  appLanguage: () => LanguageVarious;
  documentParserMode: () => DocumentParserMode;
  files: ManagedFileResolver;
  inferenceModel: AgentInferenceModelResolver;
  imageGeneration?: AgentImageGenerationPort;
  /** Bound to the Host's lifecycle signal so stopping the Host aborts naming. */
  naming(signal: AbortSignal): MobileAgentHostNaming;
  runtimeTools: AgentRuntimeToolResolver;
  skills?: SkillScopeSource;
  usage: Pick<AgentSessionUsageRecorder, 'drain' | 'record'>;
  tools: SystemCapabilitySource;
  webTools?(): Promise<RuntimeWebTools>;
  traces?: TraceRecorder;
};
