# Agent memory

App-owned, per-Agent file memory. No MCP server, extra package, model extractor, database table or background task is introduced.

`AgentMemoryService` owns the current host's write queues and drains them before its database closes. `context` supplies one complete snapshot per prepared language turn, including minimal/no-tool turns. `soul` supplies the persona to image generation. The thin `backend/ai/agent/tools/memoryTools.ts` adapter binds memory operations to built-in tools. The Host never reads memory files or composes their contents itself, and the memory service never imports the AI layer.

The private layout under `storageDirectory()` is `Data/Agents/<uuid>/SOUL.md`, `USER.md`, `memory/FACT.md` and `memory/JOURNAL.jsonl`. Each document and the journal is limited to 1 MiB. Memory is not an ordinary file-library resource. Soft-deleted Agents retain their files but cannot access them. Restore replaces memory together with the selected storage generation.

File responsibilities follow Desktop: SOUL holds name, personality, tone and communication style, and can carry the role when no separate Agent System Prompt is configured. USER holds user context; FACT holds durable knowledge and decisions likely to remain useful six months later; JOURNAL holds events. All three documents reach the identity snapshot in full, with their write revisions. The engine still owns model context limits. Runtime and current user instructions constrain the persona; USER, FACT and journal entries are context, not behavioral authority. Relevant memory may be updated autonomously under the existing approval policy.

`memoryBootstrap.ts` adapts Desktop's optional first-run conversation to Mobile's existing tools. It discovers role/personality/presentation and user context through at most 3–5 questions, saves SOUL and USER with `memory_update`, and renames through `agent_get`/`agent_update` when a name is chosen. Mobile has no separate configured System Prompt, so it uses Desktop's SOUL role-discovery branch. Existing persona and user context are preserved.

The nullable `agent.bootstrapCompleted` column is the authoritative setup state and travels with the database backup. New Agents start at false, which keeps setup pending even after an initial persona is supplied. True disables setup across conversations and restarts; false explicitly requests it. Existing/old-backup rows remain null and use Desktop's legacy check: SOUL must contain more than 50 characters after removing Markdown heading and quote lines to count as configured. An unreadable legacy SOUL does not trigger onboarding. The per-turn snapshot includes the current flag; changing it refreshes the same keyed memory section so stale setup guidance is withdrawn.

`memory_bootstrap` completes or resets setup for the current Agent only. Declining uses completion without renaming or modifying identity files; resetting is for an explicit user request and takes effect at the next prepared turn. This narrow state write is auto-approved so declining does not ask for another confirmation; document edits retain their existing write approval. It shares the memory queue, deletion/freeze/shutdown checks and database transaction boundary. Host preparation injects setup guidance only when the required built-in write and Agent-management tools are available. Minimal mode, tool-free models and parallel read-only replies retain memory context without onboarding.

At startup, before Agents are available, `migrateAgentInstructions` copies each non-empty legacy `agent.instructions` value verbatim to SOUL, reads it back, then clears the column. Empty values need no file. There are no pre-existing SOUL conflicts to reconcile or extra migration-state fields. A failed publication/read-back retains the legacy value. The retained database column is only an upgrade/old-backup input; ordinary CRUD no longer writes or reads persona there.

`services/agents/createAgentProfiles` owns the SOUL projection for the existing Agent API/editor. Its shipped `instructions` field now represents SOUL content, with `instructionsVersion` and optional update guard `expectedInstructionsVersion`. New Agents write their initial persona to SOUL. Agent management tools use explicit `soul`/`user` fields and document versions instead of the API compatibility name.

`createAgentMemory.ts` owns per-Agent ordering, content revisions, conflict checks, bounded journal queries and shutdown. `memoryStorage.ts` adapts Expo files. Expo iOS overwrite removes its destination before moving: replacements therefore retain a `.previous` copy until the new canonical file is published. Reads and backup capture use that copy after an interrupted replacement. This is a recoverable replacement, not a claim of an atomic native rename. Disposable `.pending` files are never memory or backup entries.

`memory_read` and `memory_search` are read-only. `memory_update` and `memory_append` follow the existing built-in write approval policy and are filtered from parallel read-only replies. Minimal mode receives the read-only identity snapshot but no application tools. Document updates require the latest content revision; clearing supplies empty snapshot sections on the next turn. Successful current-Agent tool updates also replace the current execution's trusted memory section; managing another Agent never changes the caller's identity. SOUL publication invalidates Agent API caches.

## Public boundaries

- The module root exports the lifecycle service.
- `memoryFiles` is the pure backup path/allowlist entry, without loading Expo or live services.
- `memoryContext` is the pure context formatter used by the model tool adapter, without loading native services.
- `memoryTypes` owns the backend memory types, input schemas, errors and limits; the tool adapter consumes this pure entry.
- `backup` maps the four known relative files to portable archive entries, including recoverable previous copies. It does not enumerate arbitrary private files.

Users edit SOUL through the existing Agent persona field or conversation tools. This integration adds no dedicated memory management page. `agent_get` reads a target Agent's SOUL/USER and versions; `agent_create` accepts initial documents; `agent_update` replaces or clears only requested documents with revision checks. Existing tool-call activity uses localized memory tool titles. Backup format v4 includes memory; readers retain support for portable v1/v3 and continue rejecting the experimental paired v2 format. Restoring a legacy database follows the same one-time instructions migration.

The focused tests protect isolation, conflicting writers, journal semantics, byte limits, deletion/freeze/shutdown and interrupted publication. Run them only when verification is authorized.
