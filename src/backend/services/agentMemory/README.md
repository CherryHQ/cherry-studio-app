# Agent memory

App-owned, per-Agent file memory. No MCP server, extra package, model extractor, database table or background task is introduced.

`AgentMemoryService` owns the current host's write queues and drains them before its database closes. Its public `module` is `Backend.agentMemory`; `context` supplies one complete snapshot per prepared language turn. The thin `backend/ai/agent/tools/memoryTools.ts` adapter binds its operations to built-in tools. The Host never reads memory files or composes their contents itself, and the memory service never imports the AI layer.

The private layout under `storageDirectory()` is `Data/Agents/<uuid>/SOUL.md`, `USER.md`, `memory/FACT.md` and `memory/JOURNAL.jsonl`. The three documents are limited to 32 KiB each; the journal to 1 MiB. Memory is not an ordinary file-library resource. Soft-deleted Agents retain their files but cannot access them. Restore replaces memory together with the selected storage generation.

Each document's escaped model preview is bounded to 6,000 characters. Longer previews carry `truncated` and a non-writable `read-required` version: the model must read the complete document before replacing it. This keeps automatic memory context small without allowing a partial preview to clobber the full document.

`createAgentMemory.ts` owns per-Agent ordering, content revisions, conflict checks, bounded journal queries and shutdown. `memoryStorage.ts` adapts Expo files. Expo iOS overwrite removes its destination before moving: replacements therefore retain a `.previous` copy until the new canonical file is published. Reads and backup capture use that copy after an interrupted replacement. This is a recoverable replacement, not a claim of an atomic native rename. Disposable `.pending` files are never memory or backup entries.

`memory_read` and `memory_search` are read-only. `memory_update` and `memory_append` follow the existing built-in write approval policy and are filtered from parallel read-only replies. Minimal mode receives the read-only identity snapshot but no application tools. Writes and UI edits share the same revision checks; clearing supplies empty snapshot sections on the next turn. Successful tool updates also replace the current execution's trusted memory section.

## Public boundaries

- The module root exports the lifecycle service.
- `memoryFiles` is the pure backup path/allowlist entry, without loading Expo or live services.
- `memoryContext` is the pure context formatter used by the model tool adapter, without loading native services.
- `backup` maps the four known relative files to portable archive entries, including recoverable previous copies. It does not enumerate arbitrary private files.
- Frontend callers use `AgentMemoryModule` from `shared/contracts/agentMemory`, never concrete services or physical paths.

The editor uses explicit Save/Close and guards dirty drafts independently of Agent definition autosave. Journals are read-only and large journal previews show the latest slice. Backup format v4 includes memory; readers retain support for portable v1/v3 and continue rejecting the experimental paired v2 format.

The focused tests protect isolation, conflicting writers, journal semantics, byte limits, deletion/freeze/shutdown and interrupted publication. Run them only when verification is authorized.
