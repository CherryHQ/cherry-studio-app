/**
 * Cherry Agent Protocol: the application contract between the Agent Client and
 * the Mobile Agent Host, per `docs/references/agent/agent-protocol.md`.
 *
 * Operation inputs, results, snapshots, and events are JSON-safe values
 * validated at this boundary (invariant 9: every protocol value survives a
 * JSON round trip and re-validates against its schema). Subscription callbacks
 * and unsubscribe handles are process-local transport mechanics, not protocol
 * data. Runtime objects and provider SDK payloads never appear in protocol
 * values; failure snapshots retain only allowlisted source identity strings.
 *
 * Types are inferred from the zod schemas so the validated shape and the
 * static shape cannot drift.
 *
 * The contract is split by what changes it: `views` are the persisted and
 * projected values, `events` is what an observer receives, `inputs` is what
 * an operation accepts, and `protocol` is the interface that ties them
 * together. Callers import this root; a module may import one leaf to state
 * which side of the protocol it depends on.
 */

export {
  AgentMessageDeltaSchema,
  AgentEventSchema,
  AgentSessionSnapshotSchema,
  type AgentEvent,
  type AgentMessageDelta,
  type AgentSessionObservation,
  type AgentSessionSnapshot,
} from './events';
export {
  AgentCancelTurnInputSchema,
  AgentDeleteSessionInputSchema,
  AgentForkSessionInputSchema,
  AgentRenameSessionInputSchema,
  AgentRespondApprovalInputSchema,
  AgentStartSessionInputSchema,
  AgentSubmitMessageInputSchema,
  type AgentForkSessionInput,
  type AgentStartSessionInput,
  type AgentSubmitMessageInput,
} from './inputs';
export { AgentProtocolError, type AgentProtocol } from './protocol';
export {
  AgentApprovalViewSchema,
  AgentCapabilitiesSchema,
  AgentErrorViewSchema,
  AgentExecutionTargetSchema,
  AgentFailureReasonSchema,
  AgentFailureSnapshotSchema,
  AgentInferenceSnapshotSchema,
  AgentInferenceSnapshotV1Schema,
  AgentInferenceSnapshotViewSchema,
  AgentInputPartSchema,
  AgentMessagePartSchema,
  AgentMessageToolRefSchema,
  AgentMessageViewSchema,
  AgentSessionViewSchema,
  AgentToolRefSchema,
  AgentToolResultSchema,
  AgentTurnViewSchema,
  AgentUsageViewSchema,
  AgentViewSchema,
  JsonValueSchema,
  readAgentInferenceSnapshot,
  type AgentApprovalView,
  type AgentCapabilities,
  type AgentErrorView,
  type AgentExecutionTarget,
  type AgentFailureReason,
  type AgentFailureSnapshot,
  type AgentInferenceSnapshot,
  type AgentInferenceSnapshotV1,
  type AgentInferenceSnapshotView,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageToolRef,
  type AgentMessageView,
  type AgentSessionView,
  type AgentToolRef,
  type AgentTurnView,
  type AgentUsageView,
  type AgentView,
  type JsonValue,
} from './views';
