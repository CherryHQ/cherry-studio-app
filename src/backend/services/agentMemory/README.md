# Agent Memory

Mobile adapts the portable [memory package](../../../../packages/memory/README.md) to the product
database, Expo files, Agent lifecycle and existing settings. The package follows Desktop draft
[#23128](https://github.com/CherryHQ/cherry-studio/pull/23128) at
`522ff3722466944c3cbd51eabed3374dd443d5cc`. Platform code stays here so that adopting Desktop's
future independent package does not require putting Mobile storage, scheduling or UI in the core.

## Content, ownership and access

Files under `storageDirectory()` own the actual content:

- `Data/Memory/MEMORY.md` and `.memories/*.md`: personal shared memory.
- `Data/Agents/<uuid>/MEMORY.md` and `.memories/*.md`: that Agent's private project/customer knowledge.
- `Data/Agents/<uuid>/SOUL.md` and `USER.md`: persona and user identity/context.
- `Data/MemoryBackups/shared/` and `agent/<uuid>/`: controlled-change recovery manifests.

The product database owns access and progress, not another copy of memory bodies. Organization
Agents retain their server-owned instructions in the database: those instructions are neither
migrated to SOUL nor exposed through identity-memory tools. Persisted
`agent.shared_memory_enabled` defaults to true for Mobile Agents, matching Desktop's Agent
default. Creation/update DTOs and the existing Agent editor expose it. Mobile has no separate
Desktop Assistant entity. `app_state` stores conversation protection fingerprints, maintenance
cursors and bounded processing metadata. Historical recall reads successful product messages on
the selected branch; Pi working copies and model summaries are not factual sources.

`AgentMemoryService` owns the lifecycle. It creates scope sessions from confirmed live
Agent/session ownership, captures the Agent revision and conversation generation, and rechecks
them before publication. Shared opt-out, deletion, backup freeze and shutdown revoke pending
operations. Approval cannot grant access to another Agent's private files.

## Conversation flow

The Host supplies two named sections: current SOUL/USER identity and managed entry references.
The entry is fixed per product conversation/scope until process replacement or global invalidation;
ordinary changes appear in new conversations. File lists, full reads, edits and recall are tools.
A complete controlled read produces a caller-bound receipt. Cached entries, excerpts,
model-supplied hashes and copied receipts cannot authorize editing.

Before every model request, including queued work, recovery and requests after compaction, the
Host refreshes identity and live shared access through the Runtime's generic instruction port.
Pi replaces only native named-section metadata, preserving unrelated retained instructions,
user messages and tools. Permission checks run again at provider/tool boundaries. Shared opt-out
withdraws the shared entry and prevents shared tools; it does not erase historical user messages.

Clear/expired/forgotten state changes the persisted protection fingerprint. An old conversation
then returns `MEMORY_CONTEXT_CHANGED`, even if shared memory was switched off or the app restarted.
A new empty conversation receives the filtered current view. Ordinary model writes, extraction
and organization do not edit structured scopes; recovery cannot bypass forgetting markers.

`memory_search` recalls this Agent's own successful selected-branch conversations, excluding the
current question. An answer has four calls, up to six hits and 22 bounded excerpts per result.
User text is evidence; assistant text supplies context. Source versions, branch membership and
protection boundaries are checked again before returning results.

## Foreground maintenance and settings

The existing model settings page contains two independent default-on preferences,
`memory.generate.enabled` and `memory.organize.enabled`, status, shared-memory organization,
recovery and clear. There is no dedicated memory management page. Confirmation binds a bounded
preview token; newer edits become conflicts, and partial results remain distinguishable from success.

`memoryMaintenance` uses the existing foreground-only Job Runtime with one worker and no automatic
job replay. Successful leading answers admit only IDs/versions to a bounded volatile queue. The
source must still belong to a live opted-in Agent and selected branch when extracted. Messages
are bounded to 16/32,000 UTF-8 bytes, 8,000 per message. Startup, model/preference changes and shared
clear/recovery establish new admission boundaries; old turns are not replayed after re-enabling.
Only supported personal additions are saved to shared memory. Duplicates/conflicts cannot silently
replace existing facts; project/customer facts remain private-tool work.

Organization runs with the default model while the app is active and Agent conversations are
idle. It scans the entry plus rotating bounded topics, using edit counts, pending age and size
warnings. It respects model/file budgets, two attempts and backoff, revalidates full-read
dependencies, and records confirmed output hashes. Generation and organization cancel independently;
default-model changes cancel both. Losing foreground, scope authority, source versions or the
storage gate aborts work. This is not OS background execution. Provider selection and usage
accounting stay in bootstrap/AI owners.

## Identity, migration and backup

The package retains identity ordering, SHA-256 revisions, 1 MiB UTF-8 limits, bootstrap state and
shutdown draining. `agent.bootstrapCompleted` remains the authoritative optional-setup flag:
true completes/skips, false explicitly requests setup, and legacy null uses Desktop's substantive
SOUL check. Bootstrap guidance requires the necessary write tools. Declining does not rename the
Agent or change identity. `memory_bootstrap` stays a narrow auto-approved setup-state operation;
document changes retain the existing approval policy.

The shipped user-owned `agent.instructions` to SOUL migration remains: publish, read back, then clear the
legacy column. Agent Profiles projects local SOUL through the existing API/editor `instructions` field
with revisions. The unreleased FACT/JOURNAL experiment has no compatibility branch or active tools.

Expo overwrite is not atomic. The adapter retains `.previous` until canonical publication; reads
and backup capture use it after interruption. Staged `.pending` files are never active or archived.
Logical roots and target allowlists restrict I/O; Expo does not expose Desktop's inode/symlink
guarantees, so URI identity and portable case rules are the adapter's actual boundary.

Portable backup v4 includes declared identity, managed files and recovery manifests, using
`agent-memory/<uuid>/`, `shared-memory/` and `memory-backups/`. Private entries must belong to an
Agent in the snapshot. Staged files and working-copy databases stay excluded. Portable v1/v3 remain
supported; experimental paired v2 stays rejected. The mainline `0015_managed_remote_id` migration
is retained unchanged. One `0016_agent_memory` migration adds nullable onboarding completion and
default-on shared access together, preserving existing user/enterprise definitions and data.
