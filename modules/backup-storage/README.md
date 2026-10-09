# Backup storage

Private Expo module for local backup durability on iOS and Android. A new development client is
required after adding or changing this module; JavaScript updates cannot install it. Existing
clients without it can open the original store but cannot create or restore backups.

- `processId` survives JavaScript reloads and changes only with the native process.
- `writeControl` synchronizes a temporary record, renames it over the control record, then
  synchronizes its parent directories. The previous record or the new record is readable.
- `hashFile` computes SHA-256 in bounded chunks off the JavaScript thread.
- `sealDirectory` synchronizes candidate files and directories before they may be referenced by
  the control record. All paths must remain inside private app storage.
- On Android, `restartAfterRestore` starts a temporary Activity in a separate process, terminates
  the current process, and opens the app in a fresh process. iOS does not expose this method.

The module never closes SQLite handles. JavaScript owns the
[restore state machine](../../src/backend/data/storage/README.md). An error after rename can be
ambiguous; callers must retain staged files and require a real process restart.

Native compilation and power-loss/device acceptance require separate verification. JavaScript
tests cannot establish filesystem durability on either platform.
