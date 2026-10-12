import type {
  Api,
  Model,
  ModelThinkingLevel,
  SimpleStreamOptions,
  TranscriptContext,
} from '@earendil-works/pi-ai';
import type { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import type {
  RuntimeModel,
  RuntimeModelPreflight,
  RuntimeOptions,
  RuntimeUsageContext,
} from '../types';

/** Provider transport shared by the durable engine and the temporary model probe. */
export type PiStreamFn = (
  model: Model<Api>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;

export type PiModelResolution = {
  defaultThinkingLevel: ModelThinkingLevel;
  maxInputTokens?: number;
  model: Model<Api>;
  redactionValues: readonly string[];
  streamFn: PiStreamFn;
  supportsTools: boolean;
  usageContext: RuntimeUsageContext;
};

export interface PiRuntimeDependencies {
  preflightModel(model: RuntimeModel): RuntimeModelPreflight | Promise<RuntimeModelPreflight>;
  resolveModel(
    model: RuntimeModel,
    options: RuntimeOptions,
    sessionId: string,
    apiKeyOverride?: string,
    signal?: AbortSignal,
  ): PiModelResolution | Promise<PiModelResolution>;
}
