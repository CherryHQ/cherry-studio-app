# Data And Backup

## Implement The Complete Data Chain

Mirror all 40 desktop business tables, including Agent, Knowledge, Job, MiniApp, Note, Translate, provider/mini-app logo references, relations, indexes, checks, foreign keys, defaults, identifiers, and timestamps. Build full Data API parity even when mobile does not expose the UI, run Agent execution, index Knowledge, or schedule background jobs.

For each domain, implement this chain:

1. Drizzle schema and relations.
2. Append-only SQL migration, journal, generated snapshot, migration bundle, seed/default data, and upgrade path.
3. Shared row/domain types, DTO schemas, cache payloads, preference keys/defaults/codecs, presets, and error types.
4. Mappers and persistence services, including transactions, ordering, search, pagination, partial updates, cascades, cleanup, and data-change events.
5. Typed endpoint, handler, Bootstrap/DI registration, and client.
6. TanStack query keys/options, invalidation or optimistic behavior, and consumers when a UI exists.
7. Fresh-install, migration replay, service, handler, contract, search, sorting, and round-trip tests.

Compare Drizzle snapshots with structured JSON and schema source with the TypeScript AST. Do not call a schema aligned because table names or declarations alone match. Generate new mobile migrations with `pnpm db:generate`, register them in `src/backend/data/db/migrations.ts`, and never edit a shipped migration to erase drift.

## Preserve Deferred Domains

- Keep Knowledge tables, relations, identifiers, assistant links, and serialization data even while Knowledge UI, embedding, indexing, and retrieval are absent. Preserve links on unrelated assistant writes.
- Keep every Agent table and relationship even while application-level Agent UI, execution, Claude Code runtime, and background work remain absent.
- Implement Data APIs and persistence semantics for jobs, schedules, notes, mini apps, translation history/languages, groups, prompts, tags, file references, entity/content search, temporary chats, and import/export.
- Retain unknown enum, transport, relation, and payload fields whenever desktop storage permits them. Never use a database reset or lossy coercion to resolve drift.

## Exclude Desktop Process Concepts, Maintain Shape-Only Ports

Desktop `src/shared` is main<->renderer process-shared, not cross-platform. Files that name Electron surfaces or encode host OS capabilities (binary tool installation, CLI OAuth launch helpers, local ONNX runtimes, settings-window routes, OCR file processing, boot config, the v1->v2 migration wizard) are `explicitExclusions` in the Manifest — never port them, and never delete their seeded ghost preference keys (`feature.binary.*`, `feature.code_cli.configs`), which are serialized data under the preference parity invariant.

Files listed in a domain's `shapeOnlyPorts` are welded data-shape + desktop-logic hybrids ported shape-only (for example `preferenceTypes.ts` without the BootConfig intersection, `codeCli.ts` keeping only the enum, `shortcut.ts` keeping only the token vocabulary and binding types). On every sync, re-apply the registered trim instead of restoring the full desktop file; update the `keeps`/`drops` entry when the desktop file evolves.

## Preserve MCP Data

Persist the full desktop MCP server schema and `stdio`, `sse`, `streamableHttp`, and `inMemory` transports. Apply the `streamableHttp` restriction only when projecting records into the mobile UI/runtime. Do not rewrite, delete, expose, or normalize hidden transport records during list, get, partial update, unrelated mutation, migration, export, or import.

Seed each transport and unknown future fields in round-trip tests. Exercise the full Data API and assert hidden rows remain byte-for-byte unchanged after unrelated mutations.

## Migrate Preferences

Compare actual preference key sets, types, defaults, codecs, startup reads, settings writes, export, and import; equal key counts do not imply parity. Ship a value migration for every rename, split, merge, type change, or codec change. Preserve old values until the migration has proved successful. Never replace the preference schema and silently strand or drop prior keys.

## Enforce Desktop-Restorable Backup Compatibility

Treat restoration by desktop as a formal compatibility target for tables, relations, attachments, provider and mini-app logos, preferences, caches, manifest metadata, and unknown/deferred data. Verify mobile import, unrelated edits, mobile export, and desktop restore as one round trip.

Keep the `backup` domain blocked today: desktop v7 direct backups contain a physical SQLite database and desktop migration chain that mobile cannot currently produce or restore losslessly. Matching the latest target schema does not make archives interchangeable. Do not claim compatibility, advance the baseline, or invent a conversion without fixtures that prove both restore directions and data fidelity.

Record the archive version, database schema/migration identity, attachment and logo manifests, cache policy, unsupported records, integrity checks, and failure behavior. Prefer an explicit blocker over a backup that appears successful while discarding hidden data.
