# Data And Backup

Mobile owns its data layer independently of desktop. Read
[Data Layer](../../../../docs/references/data/README.md) and
[Universal Package](../../../../docs/references/universal-package.md) before a selected port changes
persisted contracts. Desktop table counts, migration history, and unused APIs are not requirements.

## Trace The Affected Mobile Contract

Follow admitted behavior through its actual schema, migrations, types, defaults, mappers, services,
typed endpoints, clients, query invalidation, and consumers. Preserve transactions, ordering,
partial updates, cleanup, errors, identifiers, and relationships owned by that contract.

Keep shipped migrations append-only. Cover fresh installation and affected historical upgrades when
schemas change. Do not reset the database or rewrite old migrations to hide drift. New cross-layer
Mobile contracts belong in `src/shared`; workspace packages must not import app code.

## Preserve Existing Values

- Migrate values when a persisted preference key, type, or codec changes. Do not strand values by
  merely replacing a schema or default.
- Preserve unsupported or unknown fields where current storage/import contracts retain them.
  A runtime capability filter must not destroy stored records during unrelated writes.
- Assess MCP transports against Mobile's current data and runtime contracts. Desktop support alone
  does not authorize new Mobile execution capabilities or schemas.
- Add regression coverage at the owner of affected persistence, migration, or serialization behavior.
  Do not require unused desktop Agent, Knowledge, or other feature tables as incidental sync work.

## Backup Compatibility Is An Explicit Scope

A desktop physical SQLite archive and a Mobile database are not interchangeable merely because
some entities share names. The manifest no longer has a `backup` domain. Do not report it as aligned
or as a standing blocker for an unrelated provider/icon update.

If the task includes import/export interoperability, identify the exact supported format, version,
migrations, attachments, unknown-record policy, and failure behavior. Prove the claimed direction
with fixtures and lossless round trips; state unsupported directions explicitly. Do not claim
desktop restoration or invent a converter without that evidence.
