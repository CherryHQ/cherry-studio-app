# Memory

`@cherrystudio/memory` is a private workspace package containing portable memory behavior. It
exports TypeScript source directly, like `@cherrystudio/universal`; it has no build step or native
dependency. Mobile is the current consumer. This extraction prepares for Desktop's planned
independent package; Desktop does not already publish this API.

The managed-file algorithms follow Desktop draft [#23128](https://github.com/CherryHQ/cherry-studio/pull/23128)
at `522ff3722466944c3cbd51eabed3374dd443d5cc`, including `MemoryStore`, backups, entry statuses,
candidate extraction/reconciliation and the organization planner. The earlier
[design #23035](https://github.com/CherryHQ/cherry-studio/pull/23035) remains proposed. Both drafts
are unmerged; the local API is provisional. Compare upstream public contracts and retained
behavior before replacing this implementation when the independent package lands.

## Ownership and ports

Markdown files own memory content. `MEMORY.md` is the compact entry, limited to 200 lines/25,000
UTF-8 bytes; `.memories/<name>.md` holds complete related details, limited to 25,000 bytes per
write. Shared scope contains personal context; each Agent's private scope owns project/customer
knowledge. `SOUL.md` and `USER.md` retain separate identity roles through `createAgentMemory`
and `memoryContext`. A conversation snapshot is a model reference, not authority for editing.

The package imports no app, Expo, React or Node implementation. Consumers supply:

- `MemoryPlatform`: logical-root file I/O, path validation/identity, SHA-256, UUIDs, clock and case
  policy. The adapter must reject escapes and publish recoverably. Not every platform provides
  atomic replacement or inode/symlink inspection.
- `MemoryAuthority`: a host-created scope, live authorization/storage checks and, for model
  conversations, the persisted protection-boundary check. Never deserialize it from tool input.
- `MemoryModel`: bounded text-only generation, model limits and token counting. The host owns
  provider selection, credentials, usage accounting, cancellation and scheduling.

`MemoryService` owns one store per scope, tracks in-flight work, and caches an entry snapshot per
product conversation/scope until invalidation or process replacement. Ordinary writes become
visible in a new conversation. Authorization and forgetting checks remain live on every request.
Sessions own full-read receipts and clear/recovery previews; dispose them when their caller ends.
Closing the service invalidates sessions and drains admitted operations.

## Controlled changes and forgetting

A complete read binds a receipt to exact bytes, scope, caller and generation. A write/delete
requires that receipt, version rechecks and approval of the complete immutable proposal. Approval
returns a live revocation check; custom approval also rechecks the session's storage authority.
`session.readMany` reads a batch from one complete scope snapshot and evaluates entry policy once.
Each file receives its own receipt after scope revalidation. Commit revalidates each retained batch
once, including other files in the scope; rereading one target does not discard the remaining
targets' earlier evidence. Single-file reads use the same path.
No backup means no active-file mutation. Multi-file saves report each confirmed outcome and
retain manifests after interruption. A returned promise alone is not evidence of a complete save.

Backup manifests contain originals and hashes, with up to five retained batches and 20 MiB per
scope. Pending recovery data is protected from eviction. Recovery previews the newest recoverable
operation, restores matching files, and preserves subsequent edits as conflicts.

Structured entries distinguish active, expired and forgotten facts. Model reads filter protected
facts and issue no whole-file mutation receipts for structured scopes. Clearing nonempty raw
content leaves a forgetting marker. The host persists a protection fingerprint per conversation;
old contexts fail closed when it changes, including after restart or shared-access withdrawal.
Recovery preserves these markers and cannot silently resurrect forgotten facts. Ordinary model
writes, extraction and organization pause for structured scopes until a future structured editor
can maintain provenance safely.

## Model algorithms

Extraction accepts bounded, versioned messages supplied by the host. Exact quotes must come from
user messages; assistant text is context only. Project/customer candidates cannot become shared
personal facts. Existing references quote actual supplied files. Batches preserve conditions,
dates and uncertainty and reconcile duplicates/conflicts. The host decides which validated
proposals may be saved; a candidate result is not a save.

Organization receives complete files, fitting at most ten files/50,000 bytes within model input
and output budgets. The planner rejects unread existing targets, unsafe paths and lossy/chained
deletions. A removed topic must be copied verbatim to its destination, with all remaining managed
links checked. Destinations publish before entry updates and deletions.

Jest discovers `src/__tests__` through the repository configuration. Source remains part of the
repository typecheck. Follow task verification authorization before running either.
